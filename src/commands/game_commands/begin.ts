import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameType, sendBeginGameMessage } from "./play";
import TeamScoreboard from "../../structures/team_scoreboard";
import { getDebugLogHeader, sendErrorMessage, getUserTag, getVoiceChannel, getMessageContext } from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import _logger from "../../logger";

const logger = _logger("begin");

export default class BeginCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const { guildID, author } = message;
        const gameSession = gameSessions[guildID];
        if (!gameSession || gameSession.gameType === GameType.CLASSIC) {
            return;
        }
        if (gameSession.gameType === GameType.ELIMINATION && gameSession.owner.id !== author.id) {
            sendErrorMessage(getMessageContext(message), { title: "Begin ignored", description: `Only the person who did \`${process.env.BOT_PREFIX}play elimination\` (${bold(getUserTag(gameSession.owner))}) can start the game.` });
            return;
        }
        if (gameSession.gameType === GameType.TEAMS) {
            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            if (Object.keys(teamScoreboard.getTeams()).length === 0) {
                sendErrorMessage(getMessageContext(message), { title: "Begin ignored", description: "Create a team using `,join [team name]` before you can start the game." });
                return;
            }
        }
        const guildPreference = await getGuildPreference(guildID);
        if (!gameSession.sessionInitialized) {
            sendBeginGameMessage(message.channel.name, getVoiceChannel(message).name, message);
            gameSession.startRound(guildPreference, getMessageContext(message));
            logger.info(`${getDebugLogHeader(message)} | Game session starting (${gameSession.gameType} gameType)`);
        }
    }
}
