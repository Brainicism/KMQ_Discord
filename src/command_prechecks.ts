import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    sendErrorMessage,
} from "./helpers/discord_utils";
import Session from "./structures/session";
import GameSession from "./structures/game_session";
import MessageContext from "./structures/message_context";
import { GameType, GuildTextableMessage } from "./types";
import { IPCLogger } from "./logger";
import dbContext from "./database_context";
import { state } from "./kmq_worker";
import MusicSession from "./structures/music_session";

const logger = new IPCLogger("command_prechecks");
export interface PrecheckArgs {
    message: GuildTextableMessage;
    session: Session;
    errorMessage?: string;
}

export default class CommandPrechecks {
    static inSessionCommandPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { message, session, errorMessage } = precheckArgs;
        if (!session) {
            return false;
        }

        if (session instanceof MusicSession) {
            return areUserAndBotInSameVoiceChannel(message);
        }

        const gameSession = session as GameSession;
        if (!areUserAndBotInSameVoiceChannel(message)) {
            if (
                gameSession.gameType === GameType.ELIMINATION ||
                gameSession.gameType === GameType.TEAMS
            ) {
                if (!gameSession.sessionInitialized) {
                    // The bot doesn't join the voice channel until after ,begin is called;
                    // players should still be able ,end before that happens in these game modes
                    return true;
                }
            }

            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | User and bot are not in the same voice connection`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "misc.preCheck.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    errorMessage ?? "misc.preCheck.differentVC"
                ),
            });
            return false;
        }

        return true;
    }

    static notMusicPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { session, message } = precheckArgs;
        if (session && !(session instanceof GameSession)) {
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "misc.preCheck.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "misc.preCheck.notMusicSession"
                ),
            });

            return false;
        }

        return true;
    }

    static debugServerPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { message, errorMessage } = precheckArgs;
        const isDebugServer = process.env.DEBUG_SERVER_ID === message.guildID;
        if (!isDebugServer) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | User attempted to use a command only usable in the debug server`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "misc.preCheck.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    errorMessage ?? "misc.preCheck.debugServer"
                ),
            });
        }

        return isDebugServer;
    }

    static debugChannelPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { message, errorMessage } = precheckArgs;
        const isDebugChannel =
            process.env.DEBUG_TEXT_CHANNEL_ID === message.channel.id;

        if (!isDebugChannel) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | User attempted to use a command only usable in the debug channel`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "misc.preCheck.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    errorMessage ?? "misc.preCheck.debugChannel"
                ),
            });
        }

        return isDebugChannel;
    }

    static async competitionPrecheck(
        precheckArgs: PrecheckArgs
    ): Promise<boolean> {
        const { message, session, errorMessage } = precheckArgs;
        const gameSession = session as GameSession;
        if (
            !session ||
            session instanceof MusicSession ||
            gameSession.gameType !== GameType.COMPETITION
        ) {
            return true;
        }

        const isModerator = await dbContext
            .kmq("competition_moderators")
            .select("user_id")
            .where("guild_id", "=", gameSession.guildID)
            .andWhere("user_id", "=", message.author.id)
            .first();

        if (!isModerator) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | User attempted to use a command only available to moderators in a competition`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "misc.preCheck.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    errorMessage ?? "misc.preCheck.competition"
                ),
            });
        }

        return isModerator;
    }
}
