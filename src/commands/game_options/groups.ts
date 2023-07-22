import { GROUP_LIST_URL, GroupAction } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    getInteractionValue,
    getMatchedArtists,
    notifyCommandError,
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

const logger = new IPCLogger("groups");

export default class GroupsCommand implements BaseCommand {
    aliases = ["group", "artist", "artists"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "groups",
        description: i18n.translate(
            guildID,
            "command.groups.help.description",
            {
                groupList: GROUP_LIST_URL,
            }
        ),
        usage: `/groups set [${i18n.translate(
            guildID,
            "misc.listOfGroups"
        )}]\n\n/groups add [${i18n.translate(
            guildID,
            "misc.listOfGroups"
        )}]\n\n/groups remove [${i18n.translate(
            guildID,
            "misc.listOfGroups"
        )}]\n\n/groups reset`,
        examples: [
            {
                example: "`/groups set group_1:blackpink`",
                explanation: i18n.translate(
                    guildID,
                    "command.groups.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    }
                ),
            },
            {
                example:
                    "`/groups set group_1:blackpink group_2:bts group_3:red velvet`",
                explanation: i18n.translate(
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
                example: "`/groups reset`",
                explanation: i18n.translate(
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
                label: i18n.translate(
                    guildID,
                    "misc.interaction.fullGroupsList"
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
                    `command.groups.help.interaction.${action}.description`
                ),
                description_localizations: Object.values(LocaleType)
                    .filter((x) => x !== LocaleType.EN)
                    .reduce(
                        (acc, locale) => ({
                            ...acc,
                            [locale]: i18n.translate(
                                locale,
                                `command.groups.help.interaction.${action}.description`
                            ),
                        }),
                        {}
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
                                  { ordinalNum: getOrdinalNum(x + 1) }
                              ),
                              description_localizations: Object.values(
                                  LocaleType
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
                                                      x + 1
                                                  ),
                                              }
                                          ),
                                      }),
                                      {}
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
                [],
                undefined,
                true
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
            matchedGroups,
            unmatchedGroups
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        matchedGroups: MatchedArtist[],
        unmatchedGroups: string[],
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

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
                undefined,
                interaction
            );

            return;
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
                        title: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.title"
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.description",
                            {
                                conflictingOptionOne: "`groups`",
                                conflictingOptionTwo: "`exclude`",
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: "`/exclude remove`",
                                solutionStepTwo: "`/groups`",
                                allowOrPrevent: i18n.translate(
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

        const embeds: Array<EmbedPayload> = [];

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

                groupsWarning = i18n.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        command: "/groups",
                        addOrRemove: misplacedPrefix,
                    }
                );
            }

            let suggestionsText: string | undefined;
            if (unmatchedGroups.length === 1) {
                const suggestions = await getSimilarGroupNames(
                    unmatchedGroups[0],
                    State.getGuildLocale(messageContext.guildID)
                );

                if (suggestions.length > 0) {
                    suggestionsText = i18n.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.didYouMean",
                        {
                            suggestions: suggestions.join("\n"),
                        }
                    );
                }
            }

            const descriptionText = i18n.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.added"
                    ),
                    helpGroups: "`/help groups`",
                    unmatchedGroups: unmatchedGroups.join(", "),
                    solution: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.solution",
                        {
                            command: "`/groups add`",
                        }
                    ),
                }
            );

            embeds.push({
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
                description: `${descriptionText}\n\n${suggestionsText || ""}`,
                footerText: groupsWarning,
            });
        }

        if (matchedGroups.length === 0) {
            if (embeds.length > 0) {
                await sendInfoMessage(
                    messageContext,
                    embeds[0],
                    false,
                    undefined,
                    embeds.slice(1),
                    interaction
                );
            }

            return;
        }

        await guildPreference.setGroups(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Groups set to ${guildPreference.getDisplayedGroupNames()}`
        );

        const optionsMessage = await generateOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.GROUPS, reset: false }],
            false,
            undefined,
            undefined
        );

        if (optionsMessage) {
            await sendInfoMessage(
                messageContext,
                optionsMessage,
                true,
                undefined,
                embeds,
                interaction
            );
        } else {
            await notifyCommandError(
                messageContext,
                "groups",
                "Error generating options embed payload"
            );
        }
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
                matchedGroups,
                unmatchedGroups,
                interaction,
                action === GroupAction.RESET
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
