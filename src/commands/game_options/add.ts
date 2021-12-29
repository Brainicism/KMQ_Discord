import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    getGuildPreference,
    getMatchingGroupNames,
} from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import { setIntersection } from "../../helpers/utils";
import { GROUP_LIST_URL } from "./groups";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

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

    help = (guildID: string) => ({
            name: "add",
            description: state.localizer.translate(guildID,
                "Adds one or more groups to the current {{{groups}}}, {{{exclude}}}, or {{{include}}} options.",
                {
                    groups: "`,groups`",
                    exclude: "`,exclude`",
                    include: "`,include`",
                }
            ),
            usage: ",add [groups | exclude | include] [list of groups]",
            examples: [
                {
                    example: "`,add groups twice, red velvet`",
                    explanation: state.localizer.translate(guildID,
                        "Adds {{{groupOne}}} and {{{groupTwo}}} to the current {{{groups}}} option",
                        { groupOne: "Twice", groupTwo: "Red Velvet", groups: "`,groups`" }
                    ),
                },
                {
                    example: "`,add exclude BESTie, Dia, iKON`",
                    explanation: state.localizer.translate(guildID,
                        "Adds {{{groupOne}}}, {{{groupTwo}}}, and {{{groupThree}}} to the current {{{exclude}}} option",
                        { groupOne: "BESTie", groupTwo: "Dia", groupThree: "IKON", exclude: "`,exclude`" }
                    ),
                },
                {
                    example: "`,add include exo`",
                    explanation: state.localizer.translate(guildID,
                        "Adds {{{groupOne}}} to the current {{{include}}} option",
                        { groupOne: "EXO", include: "`,include`" }
                    ),
                },
            ],
            actionRowComponents: [
                {
                    style: 5 as const,
                    url: GROUP_LIST_URL,
                    type: 2 as const,
                    label: state.localizer.translate(guildID, "Full List of Groups"),
                },
            ],
        });

    helpPriority = 200;

    call = async ({
        message,
        parsedMessage,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
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

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(message.guildID, "Unknown Group Name"),
                description: state.localizer.translate(message.guildID,
                    "One or more of the specified group names was not recognized. Those groups that matched are added. Please ensure that the group name matches exactly with the list provided by {{{helpGroups}}}. \nThe following groups were **not** recognized:\n {{{unmatchedGroups}}}",
                    {
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                    }
                ),
            });
        }

        if (matchedGroups.length === 0) {
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
                        title: state.localizer.translate(message.guildID, "Groups and Exclude Conflict"),
                        description: state.localizer.translate(message.guildID,
                            `One or more of the given {{{groups}}} is already included in {{{exclude}}}. \nThe following groups were **not** added to {{{groups}}}:\n ${[
                                ...intersection,
                            ]
                                .filter((x) => !x.includes("+"))
                                .join(
                                    ", "
                                )} \nUse {{{removeExclude}}} and then {{{groups}}} to allow them to play.`,
                            {
                                groups: `\`${process.env.BOT_PREFIX}groups\``,
                                exclude: `\`${process.env.BOT_PREFIX}exclude\``,
                                removeExclude: `\`${process.env.BOT_PREFIX}remove exclude\``,
                            }
                        ),
                    });
                }

                if (matchedGroups.length === 0) {
                    return;
                }

                await guildPreference.setGroups(matchedGroups);
                await sendOptionsMessage(
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
                        title: state.localizer.translate(message.guildID, "Groups and Exclude Conflict"),
                        description: state.localizer.translate(message.guildID,
                            `One or more of the given {{{exclude}}} groups is already included in {{{groups}}}. \nThe following groups were **not** added to {{{exclude}}}:\n ${[
                                ...intersection,
                            ]
                                .filter((x) => !x.includes("+"))
                                .join(
                                    ", "
                                )} \nUse {{{removeGroups}}} and then {{{addExclude}}} these groups to prevent them from playing.`,
                            {
                                exclude: `\`${process.env.BOT_PREFIX}exclude\``,
                                groups: `\`${process.env.BOT_PREFIX}groups\``,
                                removeGroups: `\`${process.env.BOT_PREFIX}remove groups\``,
                                addExclude: `\`${process.env.BOT_PREFIX}add exclude\``,
                            }
                        ),
                    });
                }

                if (matchedGroups.length === 0) {
                    return;
                }

                await guildPreference.setExcludes(matchedGroups);
                await sendOptionsMessage(
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
