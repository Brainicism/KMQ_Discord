import BaseCommand, { CommandArgs } from "../base_command";
import { GameType } from "./play";
import { sendErrorMessage, sendInfoMessage, getUserIdentifier } from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";

export default class JoinCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        if (!gameSessions[message.guildID] || gameSessions[message.guildID].eliminationMode === GameType.CLASSIC) {
            return;
        }
        if (gameSessions[message.guildID].sessionInitialized) {
            await sendErrorMessage(message, "Game already in session", "You can only join as a participant before an elimination game has started. Please wait until the current game ends.");
        } else if (gameSessions[message.guildID].participants.has(message.author.id)) {
            sendErrorMessage(message, "User already joined", `${bold(getUserIdentifier(message.author))} is already in the game.`);
        } else {
            gameSessions[message.guildID].addParticipant(message.author);
            sendInfoMessage(message, "Player joined", `${bold(getUserIdentifier(message.author))} joined the elimination round.`);
        }
    }
    aliases = ["j"];
}
