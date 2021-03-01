import BaseCommand, { CommandArgs } from "../base_command";
import { GameType } from "./play";
import { getUserTag, sendErrorMessage, sendInfoMessage, getMessageContext } from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";

export default class JoinCommand implements BaseCommand {
    aliases = ["j"];

    async call({ message, gameSessions }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || gameSession.gameType === GameType.CLASSIC) {
            return;
        }
        if (gameSession.participants.has(message.author.id)) {
            sendErrorMessage(getMessageContext(message), { title: "Player already joined", description: `${bold(getUserTag(message.author))} is already in the game.` });
            return;
        }

        if (gameSession.sessionInitialized) {
            const newPlayer = gameSession.addEliminationParticipant(message.author, true);
            sendInfoMessage(message, { title: "Joined Elimination Midgame", description: `\`${getUserTag(message.author)}\` has spawned with \`${newPlayer.getLives()}\` lives` });
            return;
        }

        let previouslyJoinedPlayers = gameSession.scoreboard.getPlayerNames().reverse();
        if (previouslyJoinedPlayers.length > 10) {
            previouslyJoinedPlayers = previouslyJoinedPlayers.slice(0, 10);
            previouslyJoinedPlayers.push("and many others...");
        }
        const players = `${bold(getUserTag(message.author))}, ${previouslyJoinedPlayers.join(", ")}`;
        sendInfoMessage(getMessageContext(message), { title: "Player joined", description: players });
        gameSession.addEliminationParticipant(message.author);
    }
}
