import { GroupAction, GROUP_LIST_URL } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    getMatchedArtists,
    processGroupAutocompleteInteraction,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getMatchingGroupNames } from "../../helpers/game_utils";
import { getOrdinalNum, setIntersection } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import LocaleType from "../../enums/locale_type";
import MatchedArtist from "../../interfaces/matched_artist";
import AddCommand, { AddType } from "./add";
import RemoveCommand, { RemoveType } from "./remove";
import GroupsCommand from "./groups";

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
                              required: false,
                          })),
            })),
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.EXCLUDE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.EXCLUDE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Excludes reset.`);
            return;
        }

        let excludeWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                excludeWarning = LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${parsedMessage.components[0]}`,
                        command: "exclude",
                    }
                );
            }
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const groups = await getMatchingGroupNames(groupNames);
        let { matchedGroups } = groups;
        const { unmatchedGroups } = groups;
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Attempted to set unknown excludes. excludes =  ${unmatchedGroups.join(
                    ", "
                )}`
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.description",
                    {
                        matchedGroupsAction:
                            LocalizationManager.localizer.translate(
                                message.guildID,
                                "command.exclude.failure.unrecognizedGroups.excluded"
                            ),
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                        solution: LocalizationManager.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.solution",
                            {
                                command: `\`${process.env.BOT_PREFIX}add exclude\``,
                            }
                        ),
                    }
                ),
                footerText: excludeWarning,
            });
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
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove groups\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}exclude\``,
                            allowOrPrevent:
                                LocalizationManager.localizer.translate(
                                    message.guildID,
                                    "misc.failure.groupsExcludeConflict.prevent"
                                ),
                        }
                    ),
                });
            }
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setExcludes(matchedGroups);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.EXCLUDE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Excludes set to ${guildPreference.getDisplayedExcludesGroupNames()}`
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
        let groups: Array<MatchedArtist>;
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        const action = interactionName as GroupAction;
        const enteredGroupNames = Object.values(interactionOptions);

        if (enteredGroupNames.length === 0) {
            groups = null;
        } else {
            groups = getMatchedArtists(enteredGroupNames);
        }

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
            await ExcludeCommand.updateOption(
                messageContext,
                action,
                groups,
                interaction
            );
        }
    }

    /**
     * Handles showing suggested artists as the user types for the exclude slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction
    ): Promise<void> {
        return processGroupAutocompleteInteraction(interaction);

}}
