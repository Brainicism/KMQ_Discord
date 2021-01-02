import GameSession from "../../models/game_session";
import {
    sendErrorMessage, getDebugContext, sendInfoMessage, getVoiceChannel, voicePermissionsCheck, getUserTag, getMessageContext,
} from "../../helpers/discord_utils";
import { deleteGameSession } from "../../helpers/management_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { bold } from "../../helpers/utils";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";

const logger = _logger("play");
const DEFAULT_LIVES = 10;

export enum GameType {
    CLASSIC = "classic",
    ELIMINATION = "elimination",
}

export default class PlayCommand implements BaseCommand {
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
        description: "Starts a game of KMQ. Pick between classic (default) and elimination mode",
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

    async call({ message, gameSessions, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const voiceChannel = getVoiceChannel(message);
        if (!voiceChannel) {
            await sendErrorMessage(getMessageContext(message),
                "Join a voice channel",
                `Send \`${process.env.BOT_PREFIX}play\` again when you are in a voice channel.`);
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        } else {
            if (!voicePermissionsCheck(message)) {
                return;
            }
            const isEliminationMode = parsedMessage.components.length >= 1 && parsedMessage.components[0].toLowerCase() === "elimination";
            if (gameSessions[message.guildID] && !gameSessions[message.guildID].sessionInitialized && isEliminationMode) {
                // User sent ,play elimination twice, reset the GameSession
                deleteGameSession(message.guildID);
            }
            if (!gameSessions[message.guildID] || (!isEliminationMode && !gameSessions[message.guildID].sessionInitialized)) {
                // (1) No game session exists yet (create CLASSIC or ELIMINATION game), or
                // (2) User attempting to ,play after a ,play elimination that didn't start, start CLASSIC game
                const textChannel = message.channel;
                const gameOwner = message.author;
                let startTitle: string;
                let gameInstructions: string;
                let gameSession: GameSession;
                if (isEliminationMode) {
                    // (1) ELIMINATION game creation
                    const lives = parsedMessage.components.length > 1 ? parseInt(parsedMessage.components[1], 10) : DEFAULT_LIVES;
                    startTitle = `\`${process.env.BOT_PREFIX}join\` the game and start it with \`${process.env.BOT_PREFIX}begin\`!`;
                    gameInstructions = `Type \`${process.env.BOT_PREFIX}join\` to play in the upcoming elimination game. Once all have joined, ${bold(getUserTag(gameOwner))} must send \`${process.env.BOT_PREFIX}begin\` to start the game. Everyone begins with \`${lives}\` lives.`;
                    gameSession = new GameSession(textChannel, voiceChannel, gameOwner, GameType.ELIMINATION, lives);
                    gameSession.addEliminationParticipant(gameOwner);
                } else {
                    // (1 and 2) CLASSIC game creation
                    gameInstructions = "Listen to the song and type your guess!";
                    startTitle = `Game starting in #${textChannel.name} in 🔊 ${voiceChannel.name}`;
                    gameSession = new GameSession(textChannel, voiceChannel, gameOwner, GameType.CLASSIC);
                }

                gameSessions[message.guildID] = gameSession;
                await sendInfoMessage(getMessageContext(message), startTitle, gameInstructions);

                if (!isEliminationMode) {
                    // ELIMINATION startRound deferred to ,begin
                    gameSessions[message.guildID].startRound(guildPreference, getMessageContext(message));
                    logger.info(`${getDebugContext(message)} | Game session starting`);
                }
            } else {
                await sendErrorMessage(getMessageContext(message), "Game already in session", null);
            }
        }
    }
}
