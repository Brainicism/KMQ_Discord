import { areUserAndBotInSameVoiceChannel, getDebugLogHeader, sendErrorMessage } from "./helpers/discord_utils";
import GameSession from "./structures/game_session";
import MessageContext from "./structures/message_context";
import { GameType, GuildTextableMessage } from "./types";
import { IPCLogger } from "./logger";
import dbContext from "./database_context";

const logger = new IPCLogger("command_prechecks");
export interface PrecheckArgs {
    message: GuildTextableMessage;
    gameSession: GameSession;
    errorMessage?: string;
}

export default class CommandPrechecks {
    static inGameCommandPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { message, gameSession, errorMessage } = precheckArgs;
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

    static debugServerPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { message, errorMessage } = precheckArgs;
        const isDebugServer = process.env.DEBUG_SERVER_ID === message.guildID;
        if (!isDebugServer) {
            logger.warn(`${getDebugLogHeader(message)} | User attempted to use a command only usable in the debug server`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: errorMessage ?? "You can't do that in this server." });
        }

        return isDebugServer;
    }

    static debugChannelPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { message, errorMessage } = precheckArgs;
        const isDebugChannel = process.env.DEBUG_TEXT_CHANNEL_ID === message.channel.id;
        if (!isDebugChannel) {
            logger.warn(`${getDebugLogHeader(message)} | User attempted to use a command only usable in the debug channel`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: errorMessage ?? "You can't do that in this channel." });
        }

        return isDebugChannel;
    }

    static async competitionPrecheck(precheckArgs: PrecheckArgs): Promise<boolean> {
        const { message, gameSession, errorMessage } = precheckArgs;
        if (!gameSession || gameSession.gameType !== GameType.COMPETITION) {
            return true;
        }

        const isModerator = await dbContext.kmq("competition_moderators").select("user_id")
            .where("guild_id", "=", gameSession.guildID)
            .andWhere("user_id", "=", message.author.id)
            .first();

        if (!isModerator) {
            logger.warn(`${getDebugLogHeader(message)} | User attempted to use a command only available to moderators in a competition`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Wait...", description: errorMessage ?? "This command has been disabled for use by regular users in the competition." });
        }

        return isModerator;
    }
}
