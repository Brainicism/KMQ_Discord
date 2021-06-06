import BaseCommand, { CommandArgs } from "../base_command";
import {
    sendErrorMessage,
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    EMBED_SUCCESS_COLOR,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameType } from "./play";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";

const logger = _logger("forceskip");

export default class ForceSkipCommand implements BaseCommand {
    help = {
        name: "forceskip",
        description: "The person that started the game can force-skip the current song, no majority necessary.",
        usage: ",forceskip",
        examples: [],
        priority: 1009,
    };

    aliases = ["fskip", "fs"];

    async call({ gameSessions, message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || !gameSession.gameRound || !areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugLogHeader(message)} | Invalid force-skip. !gameSession: ${!gameSession}. !gameSession.gameRound: ${gameSession && !gameSession.gameRound}. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(message)}`);
            return;
        }
        if (gameSession.gameRound.skipAchieved || !gameSession.gameRound) {
            // song already being skipped
            return;
        }
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Force skip ignored", description: `Only the person who started the game (${bold(gameSession.owner.tag)}) can force-skip.` });
            return;
        }
        gameSession.gameRound.skipAchieved = true;
        if (gameSession.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
            eliminationScoreboard.decrementAllLives();
        }
        sendInfoMessage(MessageContext.fromMessage(message), {
            color: EMBED_SUCCESS_COLOR,
            title: "**Skip**",
            description: "Owner has forceskipped the round...",
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
        }, true);

        gameSession.endRound({ correct: false }, guildPreference, MessageContext.fromMessage(message));
        gameSession.startRound(guildPreference, MessageContext.fromMessage(message));
        logger.info(`${getDebugLogHeader(message)} | Owner force-skipped.`);
        gameSession.lastActiveNow();
    }
}
