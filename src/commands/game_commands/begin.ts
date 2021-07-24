import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendBeginGameMessage } from "./play";
import { GameType } from "../../types";
import TeamScoreboard from "../../structures/team_scoreboard";
import { getDebugLogHeader, sendErrorMessage, getUserVoiceChannel } from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import GameSession from "../../structures/game_session";
import { state } from "../../kmq";

const logger = new IPCLogger("begin");

export default class BeginCommand implements BaseCommand {
    canStart(gameSession: GameSession, authorID: string, messageContext: MessageContext): boolean {
        if (!gameSession || gameSession.gameType === GameType.CLASSIC) {
            return false;
        }

        if (gameSession.gameType === GameType.ELIMINATION) {
            if (gameSession.owner.id !== authorID) {
                sendErrorMessage(messageContext, { title: "Begin ignored", description: `Only the person who did \`${process.env.BOT_PREFIX}play elimination\` (${bold(gameSession.owner.tag)}) can start the game.` });
                return false;
            }
        } else if (gameSession.gameType === GameType.TEAMS) {
            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            if (teamScoreboard.getNumTeams() === 0) {
                sendErrorMessage(messageContext, { title: "Begin ignored", description: "Create a team using `,join [team name]` before you can start the game." });
                return false;
            }
        }

        return true;
    }
    call = async ({ message, gameSessions, channel }: CommandArgs) => {
        const { guildID, author } = message;
        const gameSession = gameSessions[guildID];

        if (!this.canStart(gameSession, author.id, MessageContext.fromMessage(message))) return;
        const guildPreference = await getGuildPreference(guildID);
        if (!gameSession.sessionInitialized) {
            let participants: Array<{ id: string, username: string, discriminator: string }>;
            if (gameSession.gameType === GameType.ELIMINATION) {
                participants = [...gameSession.participants].map((x) => state.client.users.get(x));
            } else if (gameSession.gameType === GameType.TEAMS) {
                const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
                participants = teamScoreboard.getPlayers().map((player) => ({ id: player.id, username: player.name.split("#")[0], discriminator: player.name.split("#")[1] }));
            }

            sendBeginGameMessage(channel.name, getUserVoiceChannel(message).name, message, participants);
            gameSession.startRound(guildPreference, MessageContext.fromMessage(message));
            logger.info(`${getDebugLogHeader(message)} | Game session starting (${gameSession.gameType} gameType)`);
        }
    };
}
