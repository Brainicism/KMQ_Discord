import BaseCommand, { CommandArgs } from "./base_command";
import { sendOptionsMessage, getDebugContext, sendErrorMessage } from "../helpers/discord_utils";
import { GameOption, getGuildPreference } from "../helpers/game_utils";
import { db } from "../databases";
import _logger from "../logger";
const logger = _logger("groups");
class GroupsCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guild.id);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetGroups();
            await sendOptionsMessage(message, guildPreference, GameOption.GROUPS);
            return;
        }
        const groupNames = parsedMessage.argument.split(",").map((groupName) => groupName.trim());
        const matchingGroups = (await db.kpopVideos("kpop_videos.app_kpop_group")
            .select(["id", "name"])
            .whereIn("name", groupNames))
            .map((x) => {
                return { id: x["id"], name: x["name"] }
            })
        if (matchingGroups.length !== groupNames.length) {
            const matchingGroupNames = matchingGroups.map(x => x["name"].toUpperCase());
            const unrecognizedGroups = groupNames.filter((x) => {
                return !matchingGroupNames.includes(x.toUpperCase());
            })
            await sendErrorMessage(message, "Unknown Group Name", `One or more of the specified group names was not recognized. Please ensure that the group name matches exactly with the list provided by \`${guildPreference.getBotPrefix()}help groups\` \nThe following groups were **not** recognized:\n ${unrecognizedGroups.join(", ")} `);
            return;
        }
        guildPreference.setGroups(matchingGroups);
        await sendOptionsMessage(message, guildPreference, GameOption.GROUPS);
        logger.info(`${getDebugContext(message)} | Groups set to ${guildPreference.getGroupNames()}`);
    }

    help = {
        name: "groups",
        description: "Select as many groups that you would like to hear from, separated by commas. Use without parameters to reset.",
        usage: "!groups [group1],[group2]",
        arguments: [
            {
                name: "group",
                description: "Select kpop groups as specified [here](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/data/group_list.txt)"
            }
        ]
    }
    aliases = ["group"]
}

export default GroupsCommand;
