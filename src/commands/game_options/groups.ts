import { GROUP_LIST_URL, GroupAction } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    getMatchedArtists,
    processGroupAutocompleteInteraction,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils";
import { getOrdinalNum, setIntersection } from "../../helpers/utils";
import AddCommand, { AddType } from "./add";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import RemoveCommand, { RemoveType } from "./remove";
import Session from "../../structures/session";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type MatchedArtist from "../../interfaces/matched_artist";

const logger = new IPCLogger("groups");

export default class GroupsCommand implements BaseCommand {
    aliases = ["group", "artist", "artists"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

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
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.groups.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: Object.values(GroupAction).map((action) => ({
                name: action,
                description: LocalizationManager.localizer.translate(
                    LocaleType.EN,
                    `command.groups.interaction.${action}.description`
                ),
                type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                options:
                    action === GroupAction.RESET
                        ? []
                        : [...Array(25).keys()].map((x) => ({
                              name: `group_${x + 1}`,
                              description:
                                  LocalizationManager.localizer.translate(
                                      LocaleType.EN,
                                      `command.groups.interaction.${action}.perGroupDescription`,
                                      { ordinalNum: getOrdinalNum(x + 1) }
                                  ),
                              type: Eris.Constants.ApplicationCommandOptionTypes
                                  .STRING,
                              autocomplete: true,
                              required: x === 0,
                          })),
            })),
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        if (parsedMessage.components.length === 0) {
            await GroupsCommand.updateOption(
                MessageContext.fromMessage(message),
                GroupAction.RESET
            );
            return;
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const groups = await getMatchingGroupNames(groupNames);
        const { matchedGroups, unmatchedGroups } = groups;

        await GroupsCommand.updateOption(
            MessageContext.fromMessage(message),
            GroupAction.SET,
            matchedGroups,
            unmatchedGroups
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        action: GroupAction,
        matchedGroups?: MatchedArtist[],
        unmatchedGroups?: string[],
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = action === GroupAction.RESET;
        if (reset) {
            await guildPreference.reset(GameOption.GROUPS);
            logger.info(`${getDebugLogHeader(messageContext)} | Groups reset.`);
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.GROUPS, reset: true }],
                null,
                null,
                null,
                interaction
            );

            return;
        }

        let groupsWarning = "";
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Attempted to set unknown groups. groups = ${unmatchedGroups.join(
                    ", "
                )}`
            );

            if (
                unmatchedGroups[0].startsWith("add") ||
                unmatchedGroups[0].startsWith("remove")
            ) {
                const misplacedPrefix = unmatchedGroups[0].startsWith("add")
                    ? "add"
                    : "remove";

                groupsWarning = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${misplacedPrefix}`,
                        command: "groups",
                    }
                );
            }

            let suggestionsText: string = null;
            if (unmatchedGroups.length === 1) {
                const suggestions = await getSimilarGroupNames(
                    unmatchedGroups[0],
                    State.getGuildLocale(messageContext.guildID)
                );

                if (suggestions.length > 0) {
                    suggestionsText = LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.didYouMean",
                        {
                            suggestions: suggestions.join("\n"),
                        }
                    );
                }
            }

            const descriptionText = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction:
                        LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "misc.failure.unrecognizedGroups.added"
                        ),
                    helpGroups: interaction
                        ? "`/help groups`"
                        : `\`${process.env.BOT_PREFIX}help groups\``,
                    unmatchedGroups: unmatchedGroups.join(", "),
                    solution: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.solution",
                        {
                            command: interaction
                                ? "`/groups add`"
                                : `\`${process.env.BOT_PREFIX}add groups\``,
                        }
                    ),
                }
            );

            await sendErrorMessage(messageContext, {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
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
                sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.description",
                            {
                                conflictingOptionOne: "`exclude`",
                                conflictingOptionTwo: "`groups`",
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: interaction
                                    ? "`/exclude remove`"
                                    : `\`${process.env.BOT_PREFIX}remove exclude\``,
                                solutionStepTwo: interaction
                                    ? "`/groups`"
                                    : `\`${process.env.BOT_PREFIX}groups\``,
                                allowOrPrevent:
                                    LocalizationManager.localizer.translate(
                                        messageContext.guildID,
                                        "misc.failure.groupsExcludeConflict.allow"
                                    ),
                            }
                        ),
                    },
                    interaction
                );

                return;
            }
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setGroups(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Groups set to ${guildPreference.getDisplayedGroupNames()}`
        );

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.GROUPS, reset: false }],
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
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        const action = interactionName as GroupAction;
        const enteredGroupNames = Object.values(interactionOptions);
        const { matchedGroups, unmatchedGroups } =
            getMatchedArtists(enteredGroupNames);

        if (action === GroupAction.ADD) {
            await AddCommand.updateOption(
                messageContext,
                AddType.GROUPS,
                enteredGroupNames,
                interaction
            );
        } else if (action === GroupAction.REMOVE) {
            await RemoveCommand.updateOption(
                messageContext,
                RemoveType.GROUPS,
                enteredGroupNames,
                interaction
            );
        } else {
            await GroupsCommand.updateOption(
                messageContext,
                action,
                matchedGroups,
                unmatchedGroups,
                interaction
            );
        }
    }

    /**
     * Handles showing suggested artists as the user types for the groups slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction
    ): Promise<void> {
        return processGroupAutocompleteInteraction(interaction);
    }
}
