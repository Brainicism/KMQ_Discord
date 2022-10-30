import {
    EMBED_ERROR_COLOR,
    GROUP_LIST_URL,
    GroupAction,
    KmqImages,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    getInteractionValue,
    getMatchedArtists,
    processGroupAutocompleteInteraction,
    sendErrorMessage,
    sendInfoMessage,
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
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";
import type MatchedArtist from "../../interfaces/matched_artist";

const logger = new IPCLogger("excludes");

export default class ExcludeCommand implements BaseCommand {
    aliases = ["excludes", "ignore", "ignores"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "exclude",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.exclude.help.description",
            {
                groupList: GROUP_LIST_URL,
            }
        ),
        usage: ",exclude [group1],{group2}",
        examples: [
            {
                example: "`,exclude blackpink`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.exclude.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    }
                ),
            },
            {
                example: "`,exclude blackpink, bts, red velvet`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.exclude.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
                    }
                ),
            },
            {
                example: "`,exclude`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.exclude.help.example.reset"
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
        priority: 130,
    });

    slashCommands = (): Array<Eris.ApplicationCommandStructure> => [
        {
            name: "exclude",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.exclude.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: Object.values(GroupAction).map((action) => ({
                name: action,
                description: LocalizationManager.localizer.translate(
                    LocaleType.EN,
                    `command.exclude.interaction.${action}.description`
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
                                      `command.exclude.interaction.${action}.perGroupDescription`,
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
            await ExcludeCommand.updateOption(
                MessageContext.fromMessage(message),
                null,
                null,
                null,
                true
            );
            return;
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            groupNames
        );

        await ExcludeCommand.updateOption(
            MessageContext.fromMessage(message),
            matchedGroups,
            unmatchedGroups,
            null,
            false
        );
    };

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

        let matchedGroups: Array<MatchedArtist>;
        let unmatchedGroups: Array<string>;
        if (action === GroupAction.RESET) {
            matchedGroups = null;
            unmatchedGroups = null;
        } else {
            const groups = getMatchedArtists(enteredGroupNames);

            matchedGroups = groups.matchedGroups;
            unmatchedGroups = groups.unmatchedGroups;
        }

        if (action === GroupAction.ADD) {
            await AddCommand.updateOption(
                messageContext,
                AddType.EXCLUDE,
                enteredGroupNames,
                interaction
            );
        } else if (action === GroupAction.REMOVE) {
            await RemoveCommand.updateOption(
                messageContext,
                RemoveType.EXCLUDE,
                enteredGroupNames,
                interaction
            );
        } else if (action === GroupAction.RESET) {
            await ExcludeCommand.updateOption(
                messageContext,
                matchedGroups,
                unmatchedGroups,
                interaction,
                true
            );
        }
    }

    static async updateOption(
        messageContext: MessageContext,
        matchedGroups?: MatchedArtist[],
        unmatchedGroups?: string[],
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (reset) {
            await guildPreference.reset(GameOption.EXCLUDE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Exclude reset.`
            );

            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.EXCLUDE, reset: true }],
                null,
                null,
                null,
                interaction
            );

            return;
        }

        if (guildPreference.isGroupsMode()) {
            const intersection = setIntersection(
                matchedGroups.map((x) => x.name),
                guildPreference.getGroupNames()
            );

            matchedGroups = matchedGroups.filter(
                (x) => !intersection.has(x.name)
            );

            if (intersection.size > 0) {
                await sendErrorMessage(
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
                                    ? "`/groups remove`"
                                    : `\`${process.env.BOT_PREFIX}remove groups\``,
                                solutionStepTwo: interaction
                                    ? "`/exclude`"
                                    : `\`${process.env.BOT_PREFIX}exclude\``,
                                allowOrPrevent:
                                    LocalizationManager.localizer.translate(
                                        messageContext.guildID,
                                        "misc.failure.groupsExcludeConflict.prevent"
                                    ),
                            }
                        ),
                    },
                    interaction
                );

                return;
            }
        }

        const embeds: Array<EmbedPayload> = [];

        let excludeWarning = "";
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Attempted to set unknown exclude. exclude = ${unmatchedGroups.join(
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

                excludeWarning = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${misplacedPrefix}`,
                        command: "exclude",
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

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Attempted to set unknown exclude. exclude = ${unmatchedGroups.join(
                    ", "
                )}`
            );

            const descriptionText = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction:
                        LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.exclude.failure.unrecognizedGroups.excluded"
                        ),
                    helpGroups: interaction
                        ? "`/help groups`"
                        : `\`${process.env.BOT_PREFIX}help groups\``,
                    unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                    solution: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.solution",
                        {
                            command: interaction
                                ? "`/exclude add`"
                                : `\`${process.env.BOT_PREFIX}add exclude\``,
                        }
                    ),
                }
            );

            embeds.push({
                color: EMBED_ERROR_COLOR,
                author: messageContext.author,
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
                description: `${descriptionText}\n\n${suggestionsText || ""}`,
                footerText: excludeWarning,
                thumbnailUrl: KmqImages.DEAD,
            });
        }

        if (matchedGroups.length === 0) {
            if (embeds.length > 0) {
                await sendInfoMessage(
                    messageContext,
                    embeds[0],
                    false,
                    null,
                    embeds.slice(1),
                    interaction
                );
            }

            return;
        }

        await guildPreference.setExcludes(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Exclude set to ${guildPreference.getDisplayedExcludesGroupNames()}`
        );

        const optionsMessage = await generateOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.EXCLUDE, reset: false }],
            null,
            null,
            null
        );

        await sendInfoMessage(
            messageContext,
            optionsMessage,
            true,
            null,
            embeds,
            interaction
        );
    }

    /**
     * Handles showing suggested artists as the user types for the exclude slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction
    ): Promise<void> {
        return processGroupAutocompleteInteraction(interaction);
    }
}
