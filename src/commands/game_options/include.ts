import {
    EMBED_ERROR_COLOR,
    GROUP_LIST_URL,
    GroupAction,
    KmqImages,
    OptionAction,
} from "../../constants";
import { IPCLogger } from "../../logger";
import { clickableSlashCommand, getOrdinalNum } from "../../helpers/utils";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    getInteractionValue,
    getMatchedArtists,
    notifyOptionsGenerationError,
    processGroupAutocompleteInteraction,
    sendErrorMessage,
    sendInfoMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils";
import AddCommand, { AddType } from "./add";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import RemoveCommand, { RemoveType } from "./remove";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";
import type MatchedArtist from "../../interfaces/matched_artist";

const COMMAND_NAME = "include";
const logger = new IPCLogger(COMMAND_NAME);

export default class IncludeCommand implements BaseCommand {
    aliases = ["includes"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notPlaylistPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.include.help.description",
            {
                gender: clickableSlashCommand("gender"),
                artisttype: clickableSlashCommand("artisttype"),
                groupList: GROUP_LIST_URL,
            },
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    GroupAction.SET,
                )} group_1:blackpink`,
                explanation: i18n.translate(
                    guildID,
                    "command.include.help.example.singleGroup",
                    { group: "Blackpink" },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    GroupAction.SET,
                )} group_1:blackpink group_2:bts group_3:red velvet`,
                explanation: i18n.translate(
                    guildID,
                    "command.include.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    GroupAction.ADD,
                )} group_1:exo`,
                explanation: i18n.translate(
                    guildID,
                    "command.add.help.example.include",
                    {
                        groupOne: "EXO",
                        include: clickableSlashCommand(
                            COMMAND_NAME,
                            GroupAction.ADD,
                        ),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    GroupAction.REMOVE,
                )} group_1:exo`,
                explanation: i18n.translate(
                    guildID,
                    "command.remove.help.example.include",
                    {
                        group: "exo",
                        include: clickableSlashCommand(
                            COMMAND_NAME,
                            GroupAction.REMOVE,
                        ),
                    },
                ),
            },
            {
                example: clickableSlashCommand(COMMAND_NAME, GroupAction.RESET),
                explanation: i18n.translate(
                    guildID,
                    "command.include.help.example.reset",
                ),
            },
        ],
        actionRowComponents: [
            {
                type: Eris.Constants.ComponentTypes.BUTTON,
                style: Eris.Constants.ButtonStyles.LINK,
                url: GROUP_LIST_URL,
                label: i18n.translate(
                    guildID,
                    "misc.interaction.fullGroupsList",
                ),
            },
        ],
        priority: 130,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: Object.values(GroupAction).map((action) => ({
                name: action,
                description: i18n.translate(
                    LocaleType.EN,
                    `command.include.help.interaction.${action}.description`,
                ),
                description_localizations: Object.values(LocaleType)
                    .filter((x) => x !== LocaleType.EN)
                    .reduce(
                        (acc, locale) => ({
                            ...acc,
                            [locale]: i18n.translate(
                                locale,
                                `command.include.help.interaction.${action}.description`,
                            ),
                        }),
                        {},
                    ),

                type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                options:
                    action === GroupAction.RESET
                        ? []
                        : [...Array(25).keys()].map((x) => ({
                              name: `group_${x + 1}`,
                              description: i18n.translate(
                                  LocaleType.EN,
                                  `command.include.help.interaction.${action}.perGroupDescription`,
                                  { ordinalNum: getOrdinalNum(x + 1) },
                              ),
                              description_localizations: Object.values(
                                  LocaleType,
                              )
                                  .filter((y) => y !== LocaleType.EN)
                                  .reduce(
                                      (acc, locale) => ({
                                          ...acc,
                                          [locale]: i18n.translate(
                                              locale,
                                              `command.include.help.interaction.${action}.perGroupDescription`,
                                              {
                                                  ordinalNum: getOrdinalNum(
                                                      x + 1,
                                                  ),
                                              },
                                          ),
                                      }),
                                      {},
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
                [],
                [],
                undefined,
                true,
            );
            return;
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const { matchedGroups, unmatchedGroups } =
            await getMatchingGroupNames(groupNames);

        await IncludeCommand.updateOption(
            MessageContext.fromMessage(message),
            matchedGroups,
            unmatchedGroups,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        matchedGroups: MatchedArtist[],
        unmatchedGroups: string[],
        interaction?: Eris.CommandInteraction,
        reset = false,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (reset) {
            await guildPreference.reset(GameOption.INCLUDE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Include reset.`,
            );

            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.INCLUDE, reset: true }],
                false,
                undefined,
                undefined,
                interaction,
            );

            return;
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Game option conflict between include and groups.`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.gameOptionConflict.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.gameOptionConflict.description",
                        {
                            optionOne: clickableSlashCommand("groups"),
                            optionTwo: clickableSlashCommand(COMMAND_NAME),
                            optionOneCommand: clickableSlashCommand(
                                "groups",
                                OptionAction.RESET,
                            ),
                        },
                    ),
                },
                interaction,
            );

            return;
        }

        const embeds: Array<EmbedPayload> = [];

        let includeWarning = "";
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Attempted to set unknown include. include = ${unmatchedGroups.join(
                    ", ",
                )}`,
            );

            const action = unmatchedGroups[0]!;
            if (action.startsWith("add") || action.startsWith("remove")) {
                const misplacedPrefix = action.startsWith("add")
                    ? "add"
                    : "remove";

                includeWarning = i18n.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        command: "/include",
                        addOrRemove: misplacedPrefix,
                    },
                );
            }

            const groupName = unmatchedGroups[0]!;
            let suggestionsText: string | undefined;
            if (unmatchedGroups.length === 1) {
                const suggestions = await getSimilarGroupNames(
                    groupName,
                    State.getGuildLocale(messageContext.guildID),
                );

                if (suggestions.length > 0) {
                    suggestionsText = i18n.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.didYouMean",
                        {
                            suggestions: suggestions.join("\n"),
                        },
                    );
                }
            }

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Attempted to set unknown include. include = ${unmatchedGroups.join(
                    ", ",
                )}`,
            );

            const descriptionText = i18n.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction: i18n.translate(
                        messageContext.guildID,
                        "command.include.failure.unrecognizedGroups.included",
                    ),
                    helpGroups: `${clickableSlashCommand(
                        "help",
                    )} action:groups`,
                    unmatchedGroups: unmatchedGroups.join(", "),
                    solution: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.solution",
                        {
                            command: clickableSlashCommand(
                                COMMAND_NAME,
                                GroupAction.ADD,
                            ),
                        },
                    ),
                },
            );

            embeds.push({
                color: EMBED_ERROR_COLOR,
                author: messageContext.author,
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.unrecognizedGroups.title",
                ),
                description: `${descriptionText}\n\n${suggestionsText || ""}`,
                footerText: includeWarning,
                thumbnailUrl: KmqImages.DEAD,
            });
        }

        if (matchedGroups.length === 0) {
            if (embeds.length > 0) {
                await sendInfoMessage(
                    messageContext,
                    embeds[0]!,
                    false,
                    undefined,
                    embeds.slice(1),
                    interaction,
                );
            }

            return;
        }

        await guildPreference.setIncludes(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Include set to ${guildPreference.getDisplayedIncludesGroupNames()}`,
        );

        const optionsMessage = await generateOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.INCLUDE, reset: false }],
            false,
            undefined,
            undefined,
        );

        if (optionsMessage) {
            await sendInfoMessage(
                messageContext,
                optionsMessage,
                true,
                undefined,
                embeds,
                interaction,
            );
        } else {
            await notifyOptionsGenerationError(messageContext, "include");
        }
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
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
                interaction,
            );
        } else if (action === GroupAction.REMOVE) {
            await RemoveCommand.updateOption(
                messageContext,
                RemoveType.INCLUDE,
                enteredGroupNames,
                interaction,
            );
        } else {
            await IncludeCommand.updateOption(
                messageContext,
                matchedGroups,
                unmatchedGroups,
                interaction,
                action === GroupAction.RESET,
            );
        }
    }

    /**
     * Handles showing suggested artists as the user types for the include slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction,
    ): Promise<void> {
        return processGroupAutocompleteInteraction(interaction);
    }
}
