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
import { GameOption, MatchedArtist } from "../../types";
import MessageContext from "../../structures/message_context";
import { GROUP_LIST_URL } from "../../constants";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("remove");

enum RemoveType {
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

export default class RemoveCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 2,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(RemoveType),
            },
        ],
    };

    help = {
        name: "remove",
        description:
            "Removes one or more groups from the current `,groups`, `,exclude`, or `,include` options",
        usage: ",remove [groups | exclude | include] [list of groups]",
        examples: [
            {
                example: "`,remove groups twice, red velvet`",
                explanation:
                    "Removes Twice and Red Velvet from the current `,groups` option",
            },
            {
                example: "`,remove exclude BESTie, Dia, iKON`",
                explanation:
                    "Removes BESTie, Dia, and IKON from the current `,exclude` option",
            },
            {
                example: "`,remove include exo`",
                explanation: "Removes EXO from the current `,include` option",
            },
        ],
        priority: 200,
        actionRowComponents: [
            {
                style: 5 as const,
                url: GROUP_LIST_URL,
                type: 2 as const,
                label: "Full List of Groups",
            },
        ],
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const optionListed = parsedMessage.components[0] as RemoveType;
        let currentMatchedArtists: MatchedArtist[];
        switch (optionListed) {
            case RemoveType.GROUPS:
            case RemoveType.GROUP:
            case RemoveType.ARTIST:
            case RemoveType.ARTISTS:
                currentMatchedArtists = guildPreference.gameOptions.groups;
                break;
            case RemoveType.INCLUDE:
            case RemoveType.INCLUDES:
                currentMatchedArtists = guildPreference.gameOptions.includes;
                break;
            case RemoveType.EXCLUDE:
            case RemoveType.EXCLUDES:
                currentMatchedArtists = guildPreference.gameOptions.excludes;
                break;
            default:
        }

        if (!currentMatchedArtists) {
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Remove failed",
                description: "There are no groups currently selected",
            });
            return;
        }

        const rawGroupsToRemove = parsedMessage.argument
            .split(" ")
            .slice(1)
            .join(" ")
            .split(",")
            .map((groupName) => groupName.trim().toLowerCase());

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            rawGroupsToRemove
        );

        const remainingGroups = currentMatchedArtists.filter(
            (group) => !matchedGroups.some((x) => x.id === group.id)
        );

        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(
                    ", "
                )}`
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Unknown Group Name",
                description: `One or more of the specified group names was not recognized. Those groups that matched are removed. Please ensure that the group name matches exactly with the list provided by \`${
                    process.env.BOT_PREFIX
                }help groups\`. \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(
                    ", "
                )} `,
            });
        }

        switch (optionListed) {
            case RemoveType.GROUPS:
            case RemoveType.GROUP:
            case RemoveType.ARTIST:
            case RemoveType.ARTISTS:
                await guildPreference.setGroups(remainingGroups);
                await sendOptionsMessage(
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.GROUPS, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Group removed: ${rawGroupsToRemove}`
                );
                break;
            case RemoveType.INCLUDE:
            case RemoveType.INCLUDES:
                await guildPreference.setIncludes(remainingGroups);
                await sendOptionsMessage(
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.INCLUDE, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Include removed: ${rawGroupsToRemove}`
                );
                break;
            case RemoveType.EXCLUDE:
            case RemoveType.EXCLUDES:
                await guildPreference.setExcludes(remainingGroups);
                await sendOptionsMessage(
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.EXCLUDE, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Exclude removed: ${rawGroupsToRemove}`
                );
                break;
            default:
        }
    };
}
