import BaseCommand, { CommandArgs } from "../base_command";
import { GameType } from "./play";
import { sendErrorMessage, sendInfoMessage, getUserIdentifier } from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";

export default class JoinCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || gameSession.gameType === GameType.CLASSIC) {
            return;
        }
        if (gameSession.sessionInitialized) {
            await sendErrorMessage(message, "Game already in session", "You can only join as a participant before an elimination game has started. Please wait until the current game ends.");
            return;
        }
        if (gameSession.participants.has(message.author.id)) {
            sendErrorMessage(message, "Player already joined", `${bold(getUserIdentifier(message.author))} is already in the game.`);
        } else {
            const previouslyJoinedPlayers = gameSession.scoreboard.getPlayerNames().reverse().slice(0, 10);
            const players = `${bold(getUserIdentifier(message.author))}, ${previouslyJoinedPlayers.join(", ")}`;
            sendInfoMessage(message, "Player joined", players);
            gameSession.addParticipant(message.author);
        }
    }
    aliases = ["j"];
}
