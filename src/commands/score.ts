import BaseCommand, { CommandArgs } from "./base_command";
import { getGuildPreference } from "../helpers/game_utils";
import { sendInfoMessage, sendScoreboardMessage } from "../helpers/discord_utils";

class ScoreCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guild.id);
        const gameSession = gameSessions[message.guild.id];
        if (!gameSession) {
            sendInfoMessage(message, "No Active Game", `There is no currently active game of KMQ. Start a new game with \`${guildPreference.getBotPrefix()}play\``);
            return;
        }
        await sendScoreboardMessage(message, gameSession);
    }
    help = {
        name: "score",
        description: "See the scoreboard for the current game",
        usage: "!score",
        arguments: []
    }
    aliases = ["scoreboard"]
}
export default ScoreCommand;
