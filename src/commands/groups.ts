import BaseCommand, { CommandArgs } from "./base_command";
import { sendOptionsMessage, getDebugContext } from "../helpers/discord_utils";
import { GameOptions } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("groups");
class GroupsCommand implements BaseCommand {
    async call({ guildPreference, message, parsedMessage, db }: CommandArgs) {
        if (parsedMessage.components.length === 0) {
            guildPreference.resetGroups(db);
            await sendOptionsMessage(message, guildPreference, db, GameOptions.GROUPS);
            return;
        }
        let groupNames = parsedMessage.argument.split(",").map((groupName) => groupName.trim());
        console.log(groupNames);
        let matchingGroups = (await db.kpopVideos("kpop_videos.app_kpop_group")
            .select(["id", "name"])
            .whereIn("name", groupNames))
            .map((x) => {
                return { id: x["id"], name: x["name"] }
            })

        guildPreference.setGroups(matchingGroups, db);
        await sendOptionsMessage(message, guildPreference, db, GameOptions.GROUPS);
        logger.info(`${getDebugContext(message)} | Groups set to ${guildPreference.getGroupIds()}`);
    }

    help = {
        name: "groups",
        description: "Select as many groups that you would like to hear from, separated by commas. Use without parameters to reset.",
        usage: "!groups [group1],[group2]",
        arguments: [
            {
                name: "group",
                description: "Select groups as specified here: [placeholder]"
            }
        ]
    }
    aliases: ["group"]
}

export default GroupsCommand;
