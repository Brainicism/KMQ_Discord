import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage, getMessageContext } from "../../helpers/discord_utils";
import { getGuildPreference, getMatchingGroupNames } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";

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
            await sendOptionsMessage(message, guildPreference, GameOption.EXCLUDE);
            return;
        }
        const groupNames = parsedMessage.argument.split(",").map((groupName) => groupName.trim());
        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(groupNames);
        if (unmatchedGroups) {
            logger.info(`${getDebugLogHeader(message)} | Attempted to set unknown excludes. excludes =  ${unmatchedGroups.join(", ")}`);
            await sendErrorMessage(getMessageContext(message), "Unknown Group Name", `One or more of the specified group names was not recognized. Please ensure that the group name matches exactly with the list provided by \`${process.env.BOT_PREFIX}help groups\` \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(", ")} `);
            return;
        }

        guildPreference.setExcludes(matchedGroups);
        await sendOptionsMessage(message, guildPreference, GameOption.EXCLUDE);
        logger.info(`${getDebugLogHeader(message)} | Excludes set to ${guildPreference.getDisplayedExcludesGroupNames()}`);
    }
}
