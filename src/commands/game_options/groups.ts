import { GROUP_LIST_URL } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    artistAutocompleteFormat,
    getDebugLogHeader,
    getMatchedArtists,
    searchArtists,
    sendErrorMessage,
    sendOptionsMessage,
    tryAutocompleteInteractionAcknowledge,
} from "../../helpers/discord_utils";
import {
    containsHangul,
    getOrdinalNum,
    setIntersection,
} from "../../helpers/utils";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type MatchedArtist from "../../interfaces/matched_artist";

const logger = new IPCLogger("groups");

export default class GroupsCommand implements BaseCommand {
    aliases = ["group", "artist", "artists"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string): HelpDocumentation => ({
        name: "groups",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.groups.help.description",
            {
                groupList: GROUP_LIST_URL,
            }
        ),
        usage: ",groups [group1],{group2}",
        examples: [
            {
                example: "`,groups blackpink`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.groups.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    }
                ),
            },
            {
                example: "`,groups blackpink, bts, red velvet`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.groups.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
                    }
                ),
            },
            {
                example: "`,groups`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.groups.help.example.reset"
                ),
            },
        ],
        actionRowComponents: [
            {
                type: Eris.Constants.ComponentTypes.BUTTON,
                style: Eris.Constants.ButtonStyles.LINK,
                url: GROUP_LIST_URL,
                label: LocalizationManager.localizer.translate(
                    guildID,
                    "misc.interaction.fullGroupsList"
                ),
            },
        ],
        priority: 135,
    });

    slashCommands = (): Array<Eris.ApplicationCommandStructure> => [
        {
            name: "groups",
            description: "Play songs from the given groups.",
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [...Array(25).keys()].map((x) => ({
                name: `group_${x + 1}`,
                description: `The ${getOrdinalNum(
                    x + 1
                )} group to play songs from`,
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                autocomplete: true,
                required: false,
            })),
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        let matchedGroups: MatchedArtist[];
        if (parsedMessage.components.length === 0) {
            matchedGroups = null;
            await GroupsCommand.updateOption(
                MessageContext.fromMessage(message),
                matchedGroups
            );
            return;
        }

        let groupsWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                groupsWarning = LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${parsedMessage.components[0]}`,
                        command: "groups",
                    }
                );
            }
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const groups = await getMatchingGroupNames(groupNames);
        matchedGroups = groups.matchedGroups;
        const { unmatchedGroups } = groups;
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(
                    ", "
                )}`
            );

            let suggestionsText: string = null;
            if (unmatchedGroups.length === 1) {
                const suggestions = await getSimilarGroupNames(
                    unmatchedGroups[0],
                    State.getGuildLocale(message.guildID)
                );

                if (suggestions.length > 0) {
                    suggestionsText = LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.unrecognizedGroups.didYouMean",
                        {
                            suggestions: suggestions.join("\n"),
                        }
                    );
                }
            }

            const descriptionText = LocalizationManager.localizer.translate(
                message.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction:
                        LocalizationManager.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.added"
                        ),
                    helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                    unmatchedGroups: unmatchedGroups.join(", "),
                    solution: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.unrecognizedGroups.solution",
                        {
                            command: `\`${process.env.BOT_PREFIX}add groups\``,
                        }
                    ),
                }
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
                description: `${descriptionText}\n\n${suggestionsText || ""}`,
                footerText: groupsWarning,
            });
        }

        if (guildPreference.isExcludesMode()) {
            const intersection = setIntersection(
                matchedGroups.map((x) => x.name),
                guildPreference.getExcludesGroupNames()
            );

            matchedGroups = matchedGroups.filter(
                (x) => !intersection.has(x.name)
            );
            if (intersection.size > 0) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.description",
                        {
                            conflictingOptionOne: "`exclude`",
                            conflictingOptionTwo: "`groups`",
                            groupsList: [...intersection]
                                .filter((x) => !x.includes("+"))
                                .join(", "),
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove exclude\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}groups\``,
                            allowOrPrevent:
                                LocalizationManager.localizer.translate(
                                    message.guildID,
                                    "misc.failure.groupsExcludeConflict.allow"
                                ),
                        }
                    ),
                });
                return;
            }
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await GroupsCommand.updateOption(
            MessageContext.fromMessage(message),
            matchedGroups
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        matchedGroups: MatchedArtist[],
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = matchedGroups === null;
        if (reset) {
            await guildPreference.reset(GameOption.GROUPS);
            logger.info(`${getDebugLogHeader(messageContext)} | Groups reset.`);
        } else {
            await guildPreference.setGroups(matchedGroups);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Groups set to ${guildPreference.getDisplayedGroupNames()}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.GROUPS, reset }],
            null,
            null,
            null,
            interaction
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        let groups: Array<MatchedArtist>;
        if (interaction.data.options == null) {
            groups = null;
        } else {
            groups = getMatchedArtists(interaction.data.options);
        }

        await GroupsCommand.updateOption(messageContext, groups, interaction);
    }

    /**
     * Handles showing suggested artists as the user types for the groups slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction
    ): Promise<void> {
        const lowercaseUserInput = (
            interaction.data.options.filter((x) => x["focused"])[0][
                "value"
            ] as string
        ).toLocaleLowerCase();

        const previouslyEnteredArtists = getMatchedArtists(
            interaction.data.options.filter((x) => !x["focused"])
        ).map((x) => x?.name);

        const showHangul =
            containsHangul(lowercaseUserInput) ||
            State.getGuildLocale(interaction.guildID) === LocaleType.KO;

        await tryAutocompleteInteractionAcknowledge(
            interaction,
            artistAutocompleteFormat(
                searchArtists(lowercaseUserInput, previouslyEnteredArtists),
                showHangul
            )
        );
    }
}
