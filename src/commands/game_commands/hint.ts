import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugLogHeader, getMajorityCount, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import { getGuildPreference } from "../../helpers/game_utils";
import { GuessModeType } from "../game_options/guessmode";
import { codeLine } from "../../helpers/utils";
import { GuildTextableMessage } from "../../types";
import GameSession from "../../structures/game_session";

const logger = _logger("hint");

function isHintMajority(message: GuildTextableMessage, gameSession: GameSession): boolean {
    return gameSession.gameRound.getHintRequests() >= getMajorityCount(message);
}

async function sendHintNotification(message: GuildTextableMessage, gameSession: GameSession) {
    await sendInfoMessage(MessageContext.fromMessage(message), {
        title: "**Hint Request**",
        description: `${gameSession.gameRound.getHintRequests()}/${getMajorityCount(message)} hint requests received.`,
        author: {
            username: message.author.username,
            avatarUrl: message.author.avatarURL,
        },
    }, true);
}

export default class HintCommand implements BaseCommand {
    help = {
        name: "hint",
        description: "Gives a hint to the currently playing song",
        usage: ",hint",
        examples: [],
        priority: 1020,
    };

    aliases = ["h"];

    async call({ gameSessions, message }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession.gameRound;
        if (!gameSession || !gameRound) {
            logger.warn(`${getDebugLogHeader(message)} | No active game session`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error", description: "This command can only be used if a song is currently playing", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            return;
        }
        const guildPreference = await getGuildPreference(message.guildID);
        gameRound.hintRequested(message.author.id);

        const guessMode = guildPreference.getGuessModeType();

        if (isHintMajority(message, gameSession)) {
            let hint: string;
            switch (guessMode) {
                case GuessModeType.ARTIST:
                    hint = `Artist Name: ${gameRound.hints.artistHint}`;
                    break;
                case GuessModeType.SONG_NAME:
                case GuessModeType.BOTH:
                default:
                    hint = `Song Name: ${gameRound.hints.songHint}`;
            }
            logger.info(`${getDebugLogHeader(message)} | Hint majority received.`);
            gameRound.hintUsed = true;
            sendInfoMessage(MessageContext.fromMessage(message), { title: "Hint", description: codeLine(hint), thumbnailUrl: KmqImages.READING_BOOK });
        } else {
            logger.info(`${getDebugLogHeader(message)} | Hint request received.`);
            sendHintNotification(message, gameSession);
        }
    }
}
