import BaseCommand, { CommandArgs } from "../base_command";
import { sendErrorMessage } from "../../helpers/discord_utils";

export default class JoinCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        if (gameSessions[message.guildID] && gameSessions[message.guildID].eliminationMode && gameSessions[message.guildID].sessionInitialized) {
            await sendErrorMessage(message, "Game already in session", "You can only join as a participant before an elimination game has started. Please wait until the current game ends.");
        } else {
            gameSessions[message.guildID].addParticipant(message.author);
        }
    }
    aliases = ["j"];
    help = {
        name: "join",
        description: "Enter as a participant to an upcoming elimination game of KMQ.",
        usage: "!join",
        priority: 160,
        examples: [],
    };
}
