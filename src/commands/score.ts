import BaseCommand, { CommandArgs } from "./base_command";
import { getGuildPreference } from "../helpers/game_utils";
import { sendInfoMessage, sendScoreboardMessage } from "../helpers/discord_utils";

export default class ScoreCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
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
        examples: []
    }
    aliases = ["scoreboard"]
}
