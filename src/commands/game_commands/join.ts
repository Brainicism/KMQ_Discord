import BaseCommand, { CommandArgs } from "../base_command";
import { GameType } from "./play";
import { getUserTag, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
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
            sendErrorMessage(message, "Player already joined", `${bold(getUserTag(message.author))} is already in the game.`);
        } else {
            let previouslyJoinedPlayers = gameSession.scoreboard.getPlayerNames().reverse();
            if (previouslyJoinedPlayers.length > 10) {
                previouslyJoinedPlayers = previouslyJoinedPlayers.slice(0, 10);
                previouslyJoinedPlayers.push("and many others...");
            }
            const players = `${bold(getUserTag(message.author))}, ${previouslyJoinedPlayers.join(", ")}`;
            sendInfoMessage(message, "Player joined", players);
            gameSession.addEliminationParticipant(message.author);
        }
    }
    aliases = ["j"];
}
