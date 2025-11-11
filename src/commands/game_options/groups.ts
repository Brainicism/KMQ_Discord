import * as Eris from "eris";
import { GROUP_LIST_URL, GroupAction } from "../../constants.js";
import { IPCLogger } from "../../logger.js";
import {
    clickableSlashCommand,
    generateOptionsMessage,
    getDebugLogHeader,
    getInteractionValue,
    notifyOptionsGenerationError,
    processGroupAutocompleteInteraction,
    sendErrorMessage,
    sendInfoMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils.js";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils.js";
import { getOrdinalNum, setIntersection } from "../../helpers/utils.js";
import AddCommand, { AddType } from "./add.js";
import CommandPrechecks from "../../command_prechecks.js";
import GameOption from "../../enums/game_option_name.js";
import GuildPreference from "../../structures/guild_preference.js";
import LocaleType from "../../enums/locale_type.js";
import MessageContext from "../../structures/message_context.js";
import RemoveCommand, { RemoveType } from "./remove.js";
import Session from "../../structures/session.js";
import State from "../../state.js";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type EmbedPayload from "../../interfaces/embed_payload.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "groups";
const logger = new IPCLogger(COMMAND_NAME);

export default class GroupsCommand implements BaseCommand {
    aliases = ["group", "artist", "artists"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notPlaylistPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.groups.help.description",
            {
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
                    "command.groups.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    GroupAction.SET,
                )} group_1:blackpink group_2:bts group_3:red velvet`,
                explanation: i18n.translate(
                    guildID,
                    "command.groups.help.example.multipleGroups",
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
                )} group_1:twice group_2:red velvet`,
                explanation: i18n.translate(
                    guildID,
                    "command.add.help.example.groups",
                    {
                        groupOne: "Twice",
                        groupTwo: "Red Velvet",
                        groups: clickableSlashCommand(
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
                )} group_1:twice group_2:red velvet`,
                explanation: i18n.translate(
                    guildID,
                    "command.remove.help.example.groups",
                    {
                        groupOne: "Twice",
                        groupTwo: "Red Velvet",
                        groups: clickableSlashCommand(
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
                    "command.groups.help.example.reset",
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
        priority: 135,
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
                    `command.groups.help.interaction.${action}.description`,
                ),
                description_localizations: Object.values(LocaleType)
                    .filter((x) => x !== LocaleType.EN)
                    .reduce(
                        (acc, locale) => ({
                            ...acc,
                            [locale]: i18n.translate(
                                locale,
                                `command.groups.help.interaction.${action}.description`,
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
                                  `command.groups.help.interaction.${action}.perGroupDescription`,
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
                                              `command.groups.help.interaction.${action}.perGroupDescription`,
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
            await GroupsCommand.updateOption(
                MessageContext.fromMessage(message),
                [],
                undefined,
                true,
            );
            return;
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        await GroupsCommand.updateOption(
            MessageContext.fromMessage(message),
            groupNames,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        enteredGroupNames: Array<string>,
        interaction?: Eris.CommandInteraction,
        reset = false,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const matchingGroupNames = await getMatchingGroupNames(
            State.aliases.artist,
            enteredGroupNames,
        );

        let matchedGroups = matchingGroupNames.matchedGroups;
        const unmatchedGroups = matchingGroupNames.unmatchedGroups;

        if (reset) {
            await guildPreference.reset(GameOption.GROUPS);
            logger.info(`${getDebugLogHeader(messageContext)} | Groups reset.`);
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.GROUPS, reset: true }],
                false,
                undefined,
                interaction,
            );

            return;
        }

        if (guildPreference.isExcludesMode()) {
            const intersection = setIntersection(
                matchedGroups.map((x) => x.name),
                guildPreference.getExcludesGroupNames(),
            );

            matchedGroups = matchedGroups.filter(
                (x) => !intersection.has(x.name),
            );
            if (intersection.size > 0) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.description",
                            {
                                conflictingOptionOne:
                                    clickableSlashCommand(COMMAND_NAME),
                                conflictingOptionTwo:
                                    clickableSlashCommand("exclude"),
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: clickableSlashCommand(
                                    "exclude",
                                    GroupAction.REMOVE,
                                ),
                                solutionStepTwo:
                                    clickableSlashCommand(COMMAND_NAME),
                                allowOrPrevent: i18n.translate(
                                    messageContext.guildID,
                                    "misc.failure.groupsExcludeConflict.allow",
                                ),
                            },
                        ),
                    },
                    interaction,
                );

                return;
            }
        }

        const embeds: Array<EmbedPayload> = [];

        let groupsWarning = "";
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Attempted to set unknown groups. groups = ${unmatchedGroups.join(
                    ", ",
                )}`,
            );
            const action = unmatchedGroups[0]!;
            if (action.startsWith("add") || action.startsWith("remove")) {
                const misplacedPrefix = action.startsWith("add")
                    ? "add"
                    : "remove";

                groupsWarning = i18n.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        command: "/groups",
                        addOrRemove: misplacedPrefix,
                    },
                );
            }

            let suggestionsText: string | undefined;
            const groupName = unmatchedGroups[0]!;
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

            const descriptionText = i18n.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.added",
                    ),
                    helpGroups: `${clickableSlashCommand(
                        "help",
                    )} action:${COMMAND_NAME}`,
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
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.unrecognizedGroups.title",
                ),
                description: `${descriptionText}\n\n${suggestionsText || ""}`,
                footerText: groupsWarning,
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

        await guildPreference.setGroups(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Groups set to ${guildPreference.getDisplayedGroupNames()}`,
        );

        const optionsMessage = await generateOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.GROUPS, reset: false }],
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
            await notifyOptionsGenerationError(messageContext, "groups");
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

        if (action === GroupAction.ADD) {
            await AddCommand.updateOption(
                messageContext,
                AddType.GROUPS,
                enteredGroupNames,
                interaction,
            );
        } else if (action === GroupAction.REMOVE) {
            await RemoveCommand.updateOption(
                messageContext,
                RemoveType.GROUPS,
                enteredGroupNames,
                interaction,
            );
        } else {
            await GroupsCommand.updateOption(
                messageContext,
                enteredGroupNames,
                interaction,
                action === GroupAction.RESET,
            );
        }
    }

    /**
     * Handles showing suggested artists as the user types for the groups slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction,
    ): Promise<void> {
        return processGroupAutocompleteInteraction(interaction);
    }
}
