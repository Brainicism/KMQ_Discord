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
import { getMatchingGroupNames, getSimilarGroupNames } from "../../helpers/game_utils";
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
import State from "../../state";

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
        if (parsedMessage.components.length === 0) {
            await ExcludeCommand.updateOption(
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

        await ExcludeCommand.updateOption(
            MessageContext.fromMessage(message),
            GroupAction.SET,
            matchedGroups,
            unmatchedGroups
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
        if (enteredGroupNames.length > 0) {
            matchedGroups = getMatchedArtists(enteredGroupNames);
            const matchedGroupNames = matchedGroups.map((x) => x.name);
            unmatchedGroups = enteredGroupNames.filter((x) => !matchedGroupNames.includes(x));
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
        } else {
            await ExcludeCommand.updateOption(
                messageContext,
                action,
                matchedGroups,
                unmatchedGroups,
                interaction
            );
        }
    }

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
            await guildPreference.reset(GameOption.EXCLUDE);
            logger.info(`${getDebugLogHeader(messageContext)} | Exclude reset.`);
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

        let excludeWarning = "";
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Attempted to set unknown exclude. exclude = ${unmatchedGroups.join(
                    ", "
                )}`
            );

            if (["add", "remove"].includes(unmatchedGroups[0])) {
                excludeWarning = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${unmatchedGroups[0]}`,
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
                    helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                    unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                    solution: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.solution",
                        {
                            command: `\`${process.env.BOT_PREFIX}add exclude\``,
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
                sendErrorMessage(messageContext, {
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
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove groups\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}exclude\``,
                            allowOrPrevent:
                                LocalizationManager.localizer.translate(
                                    messageContext.guildID,
                                    "misc.failure.groupsExcludeConflict.prevent"
                                ),
                        }
                    ),
                }, interaction);
            }
        }



        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setExcludes(matchedGroups);
        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Exclude set to ${guildPreference.getDisplayedExcludesGroupNames()}`
        );

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.EXCLUDE, reset: false }],
            null,
            null,
            null,
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

}}
