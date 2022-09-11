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
import { getOrdinalNum } from "../../helpers/utils";
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

const logger = new IPCLogger("includes");

export default class IncludeCommand implements BaseCommand {
    aliases = ["includes"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "include",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.include.help.description",
            {
                gender: "`gender`",
                artisttype: "`artisttype`",
                groupList: GROUP_LIST_URL,
            }
        ),
        usage: ",include [group1],{group2}",
        examples: [
            {
                example: "`,include blackpink`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.include.help.example.singleGroup",
                    { group: "Blackpink" }
                ),
            },
            {
                example: "`,include blackpink, bts, red velvet`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.include.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
                    }
                ),
            },
            {
                example: "`,include`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.include.help.example.reset"
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
            name: "include",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.include.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: Object.values(GroupAction).map((action) => ({
                name: action,
                description: LocalizationManager.localizer.translate(
                    LocaleType.EN,
                    `command.include.interaction.${action}.description`
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
                                      `command.include.interaction.${action}.perGroupDescription`,
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
            await IncludeCommand.updateOption(
                MessageContext.fromMessage(message),
                GroupAction.RESET
            );
            return;
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            groupNames
        );

        await IncludeCommand.updateOption(
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
            await guildPreference.reset(GameOption.INCLUDE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Include reset.`
            );

            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.INCLUDE, reset: true }],
                null,
                null,
                null,
                interaction
            );

            return;
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Game option conflict between include and groups.`
            );

            sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.gameOptionConflict.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.gameOptionConflict.description",
                        {
                            optionOne: "`groups`",
                            optionTwo: "`include`",
                            optionOneCommand: interaction
                                ? "`/groups`"
                                : `\`${process.env.BOT_PREFIX}groups\``,
                        }
                    ),
                },
                interaction
            );

            return;
        }

        let includeWarning = "";
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Attempted to set unknown include. include = ${unmatchedGroups.join(
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

                includeWarning = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${misplacedPrefix}`,
                        command: "include",
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
                )} | Attempted to set unknown include. include = ${unmatchedGroups.join(
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
                            "command.include.failure.unrecognizedGroups.included"
                        ),
                    helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                    unmatchedGroups: unmatchedGroups.join(", "),
                    solution: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.solution",
                        {
                            command: interaction
                                ? "`/include add`"
                                : `\`${process.env.BOT_PREFIX}add include\``,
                        }
                    ),
                }
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.title"
                    ),
                    description: `${descriptionText}\n\n${
                        suggestionsText || ""
                    }`,
                    footerText: includeWarning,
                },
                matchedGroups.length === 0 ? interaction : undefined
            );
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setIncludes(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Include set to ${guildPreference.getDisplayedIncludesGroupNames()}`
        );

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.INCLUDE, reset: false }],
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
        const { unmatchedGroups, matchedGroups } =
            getMatchedArtists(enteredGroupNames);

        if (action === GroupAction.ADD) {
            await AddCommand.updateOption(
                messageContext,
                AddType.INCLUDE,
                enteredGroupNames,
                interaction
            );
        } else if (action === GroupAction.REMOVE) {
            await RemoveCommand.updateOption(
                messageContext,
                RemoveType.INCLUDE,
                enteredGroupNames,
                interaction
            );
        } else {
            await IncludeCommand.updateOption(
                messageContext,
                action,
                matchedGroups,
                unmatchedGroups,
                interaction
            );
        }
    }

    /**
     * Handles showing suggested artists as the user types for the include slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction
    ): Promise<void> {
        return processGroupAutocompleteInteraction(interaction);
    }
}
