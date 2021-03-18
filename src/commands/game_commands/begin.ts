import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameType, sendBeginGameMessage } from "./play";
import TeamScoreboard from "../../structures/team_scoreboard";
import { getDebugLogHeader, sendErrorMessage, getVoiceChannelFromMessage } from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";
import GameSession from "../../structures/game_session";

const logger = _logger("begin");

export default class BeginCommand implements BaseCommand {
    canStart(gameSession: GameSession, authorId: string, messageContext: MessageContext): boolean {
        if (!gameSession || gameSession.gameType === GameType.CLASSIC) {
            return false;
        }
        if (gameSession.gameType === GameType.ELIMINATION) {
            if (gameSession.owner.id !== authorId) {
                sendErrorMessage(messageContext, { title: "Begin ignored", description: `Only the person who did \`${process.env.BOT_PREFIX}play elimination\` (${bold(gameSession.owner.tag)}) can start the game.` });
                return false;
            }
        } else if (gameSession.gameType === GameType.TEAMS) {
            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            if (Object.keys(teamScoreboard.getTeams()).length === 0) {
                sendErrorMessage(messageContext, { title: "Begin ignored", description: "Create a team using `,join [team name]` before you can start the game." });
                return false;
            }
        }
        return true;
    }
    async call({ message, gameSessions }: CommandArgs) {
        const { guildID, author } = message;
        const gameSession = gameSessions[guildID];

        if (!this.canStart(gameSession, author.id, MessageContext.fromMessage(message))) return;
        const guildPreference = await getGuildPreference(guildID);
        if (!gameSession.sessionInitialized) {
            sendBeginGameMessage(message.channel.name, getVoiceChannelFromMessage(message).name, message);
            gameSession.startRound(guildPreference, MessageContext.fromMessage(message));
            logger.info(`${getDebugLogHeader(message)} | Game session starting (${gameSession.gameType} gameType)`);
        }
    }
}
