import GameSession from "../../models/game_session";
import {
    sendErrorMessage, getDebugContext, sendInfoMessage, getVoiceChannel, voicePermissionsCheck, getUserIdentifier,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { bold } from "../../helpers/utils";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";

const logger = _logger("play");
const DEFAULT_LIVES = 3;

export enum GameType {
    CLASSIC = "classic",
    ELIMINATION = "elimination",
}

export default class PlayCommand implements BaseCommand {
    async call({ message, gameSessions, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const voiceChannel = getVoiceChannel(message);
        if (!voiceChannel) {
            await sendErrorMessage(message,
                "Join a voice channel",
                `Send \`${process.env.BOT_PREFIX}play\` again when you are in a voice channel.`);
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        } else {
            if (!voicePermissionsCheck(message)) {
                return;
            }
            const msgHasElimination = parsedMessage.components.length >= 1 && parsedMessage.components[0].toLowerCase() === "elimination";
            if (!gameSessions[message.guildID]) {
                const textChannel = message.channel;
                const gameOwner = message.author;
                const lives = parsedMessage.components.length > 1 ? parseInt(parsedMessage.components[1], 10) : DEFAULT_LIVES;
                const gameInstructions = msgHasElimination ? `Type \`,join\` to play in the upcoming elimination game. Once all have joined, ${bold(getUserIdentifier(gameOwner))} must send \`,play\` to start the game. Everyone begins with \`${lives}\` lives.` : "Listen to the song and type your guess!";
                await sendInfoMessage(message, `Game starting in #${textChannel.name} in 🔊 ${voiceChannel.name}`, gameInstructions);
                const gameSession = new GameSession(textChannel, voiceChannel, gameOwner, msgHasElimination, lives);
                gameSessions[message.guildID] = gameSession;

                if (!msgHasElimination) {
                    gameSessions[message.guildID].startRound(guildPreference, message);
                    logger.info(`${getDebugContext(message)} | Game session starting`);
                }
            } else if (gameSessions[message.guildID].eliminationMode && !msgHasElimination && !gameSessions[message.guildID].sessionInitialized) {
                gameSessions[message.guildID].addParticipant(message.author);
                gameSessions[message.guildID].startRound(guildPreference, message);
                logger.info(`${getDebugContext(message)} | Game session starting (eliminationMode)`);
            } else {
                await sendErrorMessage(message, "Game already in session", null);
            }
        }
    }
    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "gameType",
                type: "enum" as const,
                enums: Object.values(GameType),
            },
            {
                name: "lives",
                type: "number" as const,
                minValue: 1,
                maxValue: 500,
            },
        ],
    };
    aliases = ["random", "start", "p"];
    help = {
        name: "play",
        description: "Bot plays a random song in VC; decide whether to play a classic game or an elimination game",
        usage: "!play",
        priority: 1050,
        examples: [
            {
                example: "`!play`",
                explanation: "Start a classic game of KMQ (type in your guess first to get a point)",
            },
            {
                example: "`!play elimination 5`",
                explanation: "Start an elimination game of KMQ where each player starts with `5` lives.",
            },
            {
                example: "`!play elimination`",
                explanation: `Start an elimination game of KMQ where each player starts with \`${DEFAULT_LIVES}\` lives.`,
            },
        ],
    };
}
