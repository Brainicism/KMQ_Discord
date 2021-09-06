import { areUserAndBotInSameVoiceChannel, getDebugLogHeader, sendErrorMessage } from "./helpers/discord_utils";
import GameSession from "./structures/game_session";
import MessageContext from "./structures/message_context";
import { GameType, GuildTextableMessage } from "./types";
import { IPCLogger } from "./logger";

const logger = new IPCLogger("command_prechecks");
export function inGameCommandPrecheck(message: GuildTextableMessage, gameSession: GameSession, errorMessage?: string): boolean {
    if (!gameSession) {
        return false;
    }

    if (!areUserAndBotInSameVoiceChannel(message)) {
        if (gameSession.gameType === GameType.ELIMINATION || gameSession.gameType === GameType.TEAMS) {
            if (!gameSession.sessionInitialized) {
                // The bot doesn't join the voice channel until after ,begin is called;
                // players should still be able ,end before that happens in these game modes
                return true;
            }
        }

        logger.warn(`${getDebugLogHeader(message)} | User and bot are not in the same voice connection`);
        sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: errorMessage ?? "You must be in the same voice channel as the bot to use this command." });
        return false;
    }

    return true;
}

export function debugServerPrecheck(message: GuildTextableMessage, _gameSession: GameSession, errorMessage?: string): boolean {
    const res = process.env.DEBUG_SERVER_ID === message.guildID;
    if (!res) {
        logger.warn(`${getDebugLogHeader(message)} | User attempted to use a command only usable in the debug channel`);
        sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: errorMessage ?? "You can't do that in this server." });
    }

    return res;
}

export function debugChannelPrecheck(message: GuildTextableMessage, _gameSession: GameSession, errorMessage?: string): boolean {
    const res = process.env.DEBUG_TEXT_CHANNEL_ID === message.channel.id;
    if (!res) {
        logger.warn(`${getDebugLogHeader(message)} | User attempted to use a command only usable in the debug channel`);
        sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: errorMessage ?? "You can't do that in this channel." });
    }

    return res;
}
