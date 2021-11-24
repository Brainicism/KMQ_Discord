import { getDebugLogHeader, sendErrorMessage, sendOptionsMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getGuildPreference, getMatchingGroupNames } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import { setIntersection } from "../../helpers/utils";
import { GROUP_LIST_URL } from "./groups";
import CommandPrechecks from "../../command_prechecks";

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

    help = {
        name: "add",
        description: "Adds one or more groups to the current `,groups`, `,exclude`, or `,include` options",
        usage: ",add [groups | exclude | include] [list of groups]",
        examples: [
            {
                example: "`,add groups twice, red velvet`",
                explanation: "Adds Twice and Red Velvet to the current `,groups` option",
            },
            {
                example: "`,add exclude BESTie, Dia, iKON`",
                explanation: "Adds BESTie, Dia, and IKON to the current `,exclude` option",
            },
            {
                example: "`,add includes exo`",
                explanation: "Adds EXO to the current `,includes` option",
            },
        ],
        priority: 200,
        actionRowComponents: [{ style: 5 as const, url: GROUP_LIST_URL, type: 2 as const, label: "Full List of Groups" }],
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
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
                groupNamesString = guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case AddType.EXCLUDE:
            case AddType.EXCLUDES:
                groupNamesString = guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
        }

        const currentGroupNames = !groupNamesString ? [] : groupNamesString.split(",");
        const newGroupNames = parsedMessage.argument.split(" ").slice(1).join(" ")
            .split(",")
            .map((groupName) => groupName.trim());

        const groups = await getMatchingGroupNames(currentGroupNames.concat(newGroupNames));
        let { matchedGroups } = groups;
        const { unmatchedGroups } = groups;
        if (unmatchedGroups.length) {
            logger.info(`${getDebugLogHeader(message)} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(", ")}`);
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Unknown Group Name", description: `One or more of the specified group names was not recognized. Those groups that matched are added. Please ensure that the group name matches exactly with the list provided by \`${process.env.BOT_PREFIX}help groups\`. \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(", ")} ` });
        }

        if (matchedGroups.length === 0) {
            return;
        }

        switch (optionListed) {
            case AddType.GROUPS:
            case AddType.GROUP:
            case AddType.ARTIST:
            case AddType.ARTISTS:
            {
                const intersection = setIntersection(matchedGroups.map((x) => x.name), guildPreference.getExcludesGroupNames());
                matchedGroups = matchedGroups.filter((x) => !intersection.has(x.name));
                if (intersection.size > 0) {
                    sendErrorMessage(MessageContext.fromMessage(message), { title: "Groups and Exclude Conflict", description: `One or more of the given \`groups\` is already included in \`exclude\`. \nThe following groups were **not** added to \`groups\`:\n ${[...intersection].filter((x) => !x.includes("+")).join(", ")} \nUse \`${process.env.BOT_PREFIX}remove exclude\` and then \`${process.env.BOT_PREFIX}groups\` to allow them to play.` });
                }

                if (matchedGroups.length === 0) {
                    return;
                }

                await guildPreference.setGroups(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.GROUPS, reset: false }]);
                logger.info(`${getDebugLogHeader(message)} | Group added: ${guildPreference.getDisplayedGroupNames()}`);
                break;
            }

            case AddType.INCLUDE:
            case AddType.INCLUDES:
                await guildPreference.setIncludes(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.INCLUDE, reset: false }]);
                logger.info(`${getDebugLogHeader(message)} | Include added: ${guildPreference.getDisplayedIncludesGroupNames()}`);
                break;
            case AddType.EXCLUDE:
            case AddType.EXCLUDES:
            {
                const intersection = setIntersection(matchedGroups.map((x) => x.name), guildPreference.getGroupNames());
                matchedGroups = matchedGroups.filter((x) => !intersection.has(x.name));
                if (intersection.size > 0) {
                    sendErrorMessage(MessageContext.fromMessage(message), { title: "Groups and Exclude Conflict", description: `One or more of the given \`exclude\` groups is already included in \`groups\`. \nThe following groups were **not** added to \`exclude\`:\n ${[...intersection].filter((x) => !x.includes("+")).join(", ")} \nUse \`${process.env.BOT_PREFIX}remove groups\` and then \`${process.env.BOT_PREFIX}add exclude\` these groups to prevent them from playing.` });
                }

                if (matchedGroups.length === 0) {
                    return;
                }

                await guildPreference.setExcludes(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.EXCLUDE, reset: false }]);
                logger.info(`${getDebugLogHeader(message)} | Exclude added: ${guildPreference.getDisplayedExcludesGroupNames()}`);
                break;
            }

            default:
        }
    };
}
