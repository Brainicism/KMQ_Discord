import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference, getMatchingGroupNames } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("groups");
export default class GroupsCommand implements BaseCommand {
    help = {
        name: "groups",
        description: "Select as many groups that you would like to hear from, separated by commas. A list of group names can be found [here](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/data/group_list.txt)",
        usage: ",groups [group1],{group2}",
        examples: [
            {
                example: "`,groups blackpink`",
                explanation: "Plays songs only from Blackpink",
            },
            {
                example: "`,groups blackpink, bts, red velvet`",
                explanation: "Plays songs only from Blackpink, BTS, and Red Velvet",
            },
            {
                example: "`,groups`",
                explanation: "Resets the groups option",
            },
        ],
        priority: 135,
    };

    aliases = ["group", "artist", "artists"];

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.resetGroups();
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GROUPS, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Groups reset.`);
            return;
        }
        let groupsWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                groupsWarning = `Did you mean to use ${process.env.BOT_PREFIX}${parsedMessage.components[0]} groups?`;
            }
        }
        const groupNames = parsedMessage.argument.split(",").map((groupName) => groupName.trim());
        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(groupNames);
        if (unmatchedGroups.length) {
            logger.info(`${getDebugLogHeader(message)} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(", ")}`);
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Unknown Group Name",
                description: `One or more of the specified group names was not recognized. Those groups that matched are added. Please ensure that the group name matches exactly with the list provided by \`${process.env.BOT_PREFIX}help groups\` \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(", ")} \nUse \`${process.env.BOT_PREFIX}add\` to add the unmatched groups.`,
                footerText: groupsWarning });
        }
        if (matchedGroups.length === 0) {
            return;
        }
        await guildPreference.setGroups(matchedGroups);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GROUPS, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Groups set to ${guildPreference.getDisplayedGroupNames()}`);
    };
}
