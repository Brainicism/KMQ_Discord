import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendOptionsMessage,
    getDebugLogHeader,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import {
    getGuildPreference,
    getMatchingGroupNames,
} from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import { setIntersection } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import { GameOptions } from "../../structures/guild_preference";

const logger = new IPCLogger("groups");
export const GROUP_LIST_URL = "https://kmq.kpop.gg/static/data/group_list.txt";
export default class GroupsCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = {
        name: "groups",
        description: `Select as many groups that you would like to hear from, separated by commas. A list of group names can be found [here](${GROUP_LIST_URL}).`,
        usage: ",groups [group1],{group2}",
        examples: [
            {
                example: "`,groups blackpink`",
                explanation: "Plays songs only from Blackpink",
            },
            {
                example: "`,groups blackpink, bts, red velvet`",
                explanation:
                    "Plays songs only from Blackpink, BTS, and Red Velvet",
            },
            {
                example: "`,groups`",
                explanation: "Resets the groups option",
            },
        ],
        priority: 135,
        actionRowComponents: [
            {
                style: 5 as const,
                url: GROUP_LIST_URL,
                type: 2 as const,
                label: "Full List of Groups",
            },
        ],
    };

    aliases = ["group", "artist", "artists"];

    static argumentValidator = (gameOptions: GameOptions): boolean =>
        Array.isArray(gameOptions.groups);

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.GROUPS);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.GROUPS, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Groups reset.`);
            return;
        }

        let groupsWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                groupsWarning = `Did you mean to use ${process.env.BOT_PREFIX}${parsedMessage.components[0]} groups?`;
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
                )} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(
                    ", "
                )}`
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Unknown Group Name",
                description: `One or more of the specified group names was not recognized. Those groups that matched are added. Please ensure that the group name matches exactly with the list provided by \`${
                    process.env.BOT_PREFIX
                }help groups\`. \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(
                    ", "
                )} \nUse \`${
                    process.env.BOT_PREFIX
                }add\` to add the unmatched groups.`,
                footerText: groupsWarning,
            });
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
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: "Groups and Exclude Conflict",
                    description: `One or more of the given \`groups\` is already included in \`exclude\`. \nThe following groups were **not** added to \`groups\`:\n ${[
                        ...intersection,
                    ]
                        .filter((x) => !x.includes("+"))
                        .join(", ")} \nUse \`${
                        process.env.BOT_PREFIX
                    }remove exclude\` and then \`${
                        process.env.BOT_PREFIX
                    }groups\` to allow them to play.`,
                });
                return;
            }
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
            )} | Groups set to ${guildPreference.getDisplayedGroupNames()}`
        );
    };
}
