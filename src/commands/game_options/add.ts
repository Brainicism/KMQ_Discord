import { GROUP_LIST_URL } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils";
import { setIntersection } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("add");

enum AddType {
    // Groups with aliases
    GROUPS = "groups",
    GROUP = "group",
    ARTIST = "artist",
    ARTISTS = "artists",

    // Exclude with aliases
    EXCLUDE = "exclude",
    EXCLUDES = "excludes",

    // Include with aliases
    INCLUDE = "include",
    INCLUDES = "includes",
}

export default class AddCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 2,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(AddType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "add",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.add.help.description",
            {
                groups: `\`${process.env.BOT_PREFIX}groups\``,
                exclude: `\`${process.env.BOT_PREFIX}exclude\``,
                include: `\`${process.env.BOT_PREFIX}include\``,
            }
        ),
        usage: `,add [groups | exclude | include] [${LocalizationManager.localizer.translate(
            guildID,
            "misc.listOfGroups"
        )}]`,
        examples: [
            {
                example: "`,add groups twice, red velvet`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.add.help.example.groups",
                    {
                        groupOne: "Twice",
                        groupTwo: "Red Velvet",
                        groups: `\`${process.env.BOT_PREFIX}groups\``,
                    }
                ),
            },
            {
                example: "`,add exclude BESTie, Dia, iKON`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.add.help.example.exclude",
                    {
                        groupOne: "BESTie",
                        groupTwo: "Dia",
                        groupThree: "IKON",
                        exclude: `\`${process.env.BOT_PREFIX}exclude\``,
                    }
                ),
            },
            {
                example: "`,add include exo`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.add.help.example.include",
                    {
                        groupOne: "EXO",
                        include: `\`${process.env.BOT_PREFIX}include\``,
                    }
                ),
            },
        ],
        actionRowComponents: [
            {
                style: 5 as const,
                url: GROUP_LIST_URL,
                type: 2 as const,
                label: LocalizationManager.localizer.translate(
                    guildID,
                    "misc.interaction.fullGroupsList"
                ),
            },
        ],
        priority: 200,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        const optionListed = parsedMessage.components[0] as AddType;
        let groupNamesString: string;
        switch (optionListed) {
            case AddType.GROUPS:
            case AddType.GROUP:
            case AddType.ARTIST:
            case AddType.ARTISTS:
                groupNamesString = guildPreference.getDisplayedGroupNames(true);
                break;
            case AddType.INCLUDE:
            case AddType.INCLUDES:
                groupNamesString =
                    guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case AddType.EXCLUDE:
            case AddType.EXCLUDES:
                groupNamesString =
                    guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
        }

        const currentGroupNames = !groupNamesString
            ? []
            : groupNamesString.split(",");

        const newGroupNames = parsedMessage.argument
            .split(" ")
            .slice(1)
            .join(" ")
            .split(",")
            .map((groupName) => groupName.trim());

        const groups = await getMatchingGroupNames(
            currentGroupNames.concat(newGroupNames)
        );

        let { matchedGroups } = groups;
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
                    solution: "",
                }
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
                description: `${descriptionText}\n\n${suggestionsText || ""}`,
            });
        }

        // if none of the new groups were matched
        if (unmatchedGroups.length === newGroupNames.length) {
            return;
        }

        switch (optionListed) {
            case AddType.GROUPS:
            case AddType.GROUP:
            case AddType.ARTIST:
            case AddType.ARTISTS: {
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
                                conflictingOptionOne: `\`${process.env.BOT_PREFIX}groups\``,
                                conflictingOptionTwo: `\`${process.env.BOT_PREFIX}exclude\``,
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
                }

                if (matchedGroups.length === 0) {
                    return;
                }

                await guildPreference.setGroups(matchedGroups);
                await sendOptionsMessage(
                    Session.getSession(message.guildID),
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.GROUPS, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Group added: ${guildPreference.getDisplayedGroupNames()}`
                );
                break;
            }

            case AddType.INCLUDE:
            case AddType.INCLUDES:
                await guildPreference.setIncludes(matchedGroups);
                await sendOptionsMessage(
                    Session.getSession(message.guildID),
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.INCLUDE, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Include added: ${guildPreference.getDisplayedIncludesGroupNames()}`
                );
                break;
            case AddType.EXCLUDE:
            case AddType.EXCLUDES: {
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
                                conflictingOptionOne: `\`${process.env.BOT_PREFIX}exclude\``,
                                conflictingOptionTwo: `\`${process.env.BOT_PREFIX}groups\``,
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionPartOne: `\`${process.env.BOT_PREFIX}remove groups\``,
                                solutionPartTwo: `\`${process.env.BOT_PREFIX}add exclude\``,
                            }
                        ),
                    });
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
                    )} | Exclude added: ${guildPreference.getDisplayedExcludesGroupNames()}`
                );
                break;
            }

            default:
        }
    };
}
