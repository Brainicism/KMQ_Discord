import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference, getMatchingGroupNames } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("excludes");

export default class ExcludeCommand implements BaseCommand {
    help = {
        name: "exclude",
        description: "Select as many groups that you would like to ignore, separated by commas. A list of group names can be found [here](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/data/group_list.txt)",
        usage: "!exclude [group1],{group2}",
        examples: [
            {
                example: "`!exclude blackpink`",
                explanation: "Ignore songs from Blackpink",
            },
            {
                example: "`!exclude blackpink, bts, red velvet`",
                explanation: "Ignore songs from Blackpink, BTS, and Red Velvet",
            },
            {
                example: "`!exclude`",
                explanation: "Resets the exclude option",
            },
        ],
        priority: 130,
    };

    aliases = ["excludes", "ignore", "ignores"];

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetExcludes();
            logger.info(`${getDebugLogHeader(message)} | Excludes reset.`);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.EXCLUDE, reset: true });
            return;
        }
        if (guildPreference.isGroupsMode()) {
            logger.warn(`${getDebugLogHeader(message)} | Game option conflict between include and groups.`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Game Option Conflict", description: `\`groups\` game option is currently set. \`include\` and \`groups\` are incompatible. Remove the \`groups\` option by typing \`${process.env.BOT_PREFIX}groups\` to proceed` });
            return;
        }

        const groupNames = parsedMessage.argument.split(",").map((groupName) => groupName.trim());
        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(groupNames);
        if (unmatchedGroups.length) {
            logger.info(`${getDebugLogHeader(message)} | Attempted to set unknown excludes. excludes =  ${unmatchedGroups.join(", ")}`);
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Unknown Group Name", description: `One or more of the specified group names was not recognized. Those groups that matched are excluded. Please ensure that the group name matches exactly with the list provided by \`${process.env.BOT_PREFIX}help groups\` \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(", ")} ` });
        }

        if (matchedGroups.length === 0) {
            return;
        }
        guildPreference.setExcludes(matchedGroups);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.EXCLUDE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Excludes set to ${guildPreference.getDisplayedExcludesGroupNames()}`);
    }
}
