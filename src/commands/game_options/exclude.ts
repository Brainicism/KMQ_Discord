import {
    EMBED_ERROR_COLOR,
    GROUP_LIST_URL,
    GroupAction,
    KmqImages,
} from "../../constants";
import { IPCLogger } from "../../logger";
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

const COMMAND_NAME = "exclude";
const logger = new IPCLogger(COMMAND_NAME);

export default class ExcludeCommand implements BaseCommand {
    aliases = ["excludes", "ignore", "ignores"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notPlaylistPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.exclude.help.description",
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
                    "command.exclude.help.example.singleGroup",
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
                    "command.exclude.help.example.multipleGroups",
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
                )} group_1:BESTie group_2:Dia group_3:iKON`,
                explanation: i18n.translate(
                    guildID,
                    "command.add.help.example.exclude",
                    {
                        groupOne: "BESTie",
                        groupTwo: "Dia",
                        groupThree: "IKON",
                        exclude: clickableSlashCommand(
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
                )} group_1:BESTie group_2:Dia group_3:iKON`,
                explanation: i18n.translate(
                    guildID,
                    "command.remove.help.example.exclude",
                    {
                        groupOne: "BESTie",
                        groupTwo: "Dia",
                        groupThree: "iKON",
                        exclude: clickableSlashCommand(
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
                    "command.exclude.help.example.reset",
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
                    `command.exclude.help.interaction.${action}.description`,
                ),
                description_localizations: Object.values(LocaleType)
                    .filter((x) => x !== LocaleType.EN)
                    .reduce(
                        (acc, locale) => ({
                            ...acc,
                            [locale]: i18n.translate(
                                locale,
                                `command.exclude.help.interaction.${action}.description`,
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
                                  `command.exclude.help.interaction.${action}.perGroupDescription`,
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
                                              `command.exclude.help.interaction.${action}.perGroupDescription`,
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
            await ExcludeCommand.updateOption(
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

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            State.aliases.artist,
            groupNames,
        );

        await ExcludeCommand.updateOption(
            MessageContext.fromMessage(message),
            matchedGroups,
            unmatchedGroups,
            undefined,
            false,
        );
    };

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

        let matchedGroups: Array<MatchedArtist>;
        let unmatchedGroups: Array<string>;
        if (action === GroupAction.RESET) {
            matchedGroups = [];
            unmatchedGroups = [];
        } else {
            const groups = await getMatchingGroupNames(
                State.aliases.artist,
                enteredGroupNames,
            );

            matchedGroups = groups.matchedGroups;
            unmatchedGroups = groups.unmatchedGroups;
        }

        if (action === GroupAction.ADD) {
            await AddCommand.updateOption(
                messageContext,
                AddType.EXCLUDE,
                enteredGroupNames,
                interaction,
            );
        } else if (action === GroupAction.REMOVE) {
            await RemoveCommand.updateOption(
                messageContext,
                RemoveType.EXCLUDE,
                enteredGroupNames,
                interaction,
            );
        } else {
            await ExcludeCommand.updateOption(
                messageContext,
                matchedGroups,
                unmatchedGroups,
                interaction,
                action === GroupAction.RESET,
            );
        }
    }

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
            await guildPreference.reset(GameOption.EXCLUDE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Exclude reset.`,
            );

            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.EXCLUDE, reset: true }],
                false,
                undefined,
                interaction,
            );

            return;
        }

        if (guildPreference.isGroupsMode()) {
            const intersection = setIntersection(
                matchedGroups.map((x) => x.name),
                guildPreference.getGroupNames(),
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
                                    clickableSlashCommand("groups"),
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: clickableSlashCommand(
                                    "groups",
                                    GroupAction.REMOVE,
                                ),
                                solutionStepTwo:
                                    clickableSlashCommand(COMMAND_NAME),
                                allowOrPrevent: i18n.translate(
                                    messageContext.guildID,
                                    "misc.failure.groupsExcludeConflict.prevent",
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

        let excludeWarning = "";
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Attempted to set unknown exclude. exclude = ${unmatchedGroups.join(
                    ", ",
                )}`,
            );

            if (
                unmatchedGroups[0]!.startsWith("add") ||
                unmatchedGroups[0]!.startsWith("remove")
            ) {
                const misplacedPrefix = unmatchedGroups[0]!.startsWith("add")
                    ? "add"
                    : "remove";

                excludeWarning = i18n.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        command: "/exclude",
                        addOrRemove: misplacedPrefix,
                    },
                );
            }

            let suggestionsText: string | undefined;
            if (unmatchedGroups.length === 1) {
                const suggestions = await getSimilarGroupNames(
                    unmatchedGroups[0]!,
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
                )} | Attempted to set unknown exclude. exclude = ${unmatchedGroups.join(
                    ", ",
                )}`,
            );

            const descriptionText = i18n.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction: i18n.translate(
                        messageContext.guildID,
                        "command.exclude.failure.unrecognizedGroups.excluded",
                    ),
                    helpGroups: `${clickableSlashCommand(
                        "help",
                    )} action:groups`,
                    unmatchedGroups: `${unmatchedGroups.join(", ")}`,
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
                footerText: excludeWarning,
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

        await guildPreference.setExcludes(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Exclude set to ${guildPreference.getDisplayedExcludesGroupNames()}`,
        );

        const optionsMessage = await generateOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.EXCLUDE, reset: false }],
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
            await notifyOptionsGenerationError(messageContext, "exclude");
        }
    }

    /**
     * Handles showing suggested artists as the user types for the exclude slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction,
    ): Promise<void> {
        return processGroupAutocompleteInteraction(interaction);
    }
}
