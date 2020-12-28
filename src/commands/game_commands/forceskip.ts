import BaseCommand, { CommandArgs } from "../base_command";
import {
    sendSongMessage,
    sendErrorMessage,
    areUserAndBotInSameVoiceChannel,
    getDebugContext,
    getUserIdentifier,
} from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameType } from "./play";
import EliminationScoreboard from "../../models/elimination_scoreboard";
import _logger from "../../logger";

const logger = _logger("forceskip");

export default class ForceSkipCommand implements BaseCommand {
    async call({ gameSessions, message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || !gameSession.gameRound || !areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugContext(message)} | Invalid force-skip. !gameSession: ${!gameSession}. !gameSession.gameRound: ${gameSession && !gameSession.gameRound}. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(message)}`);
            return;
        }
        if (gameSession.gameRound.skipAchieved || !gameSession.gameRound) {
            // song already being skipped
            return;
        }
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(message, "Force skip ignored", `Only the person who started the game (${bold(getUserIdentifier(gameSession.owner))}) can force-skip.`);
            return;
        }
        gameSession.gameRound.skipAchieved = true;
        if (gameSession.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
            eliminationScoreboard.decrementAllLives();
        }
        sendSongMessage(message, gameSession.scoreboard, gameSession.gameRound, true);
        gameSession.endRound(false);
        gameSession.startRound(guildPreference, message);
        logger.info(`${getDebugContext(message)} | Owner force-skipped.`);
        gameSession.lastActiveNow();
    }
    help = {
        name: "forceskip",
        description: "The person that started the game can force-skip the current song, no majority necessary.",
        usage: "!forceskip",
        examples: [],
        priority: 1009,
    };
    aliases = ["fskip", "fs"];
}
