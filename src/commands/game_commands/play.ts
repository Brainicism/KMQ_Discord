import GameSession from "../../models/game_session";
import state from "../../kmq";
import {
    sendErrorMessage, getDebugContext, sendInfoMessage, getVoiceChannel, voicePermissionsCheck, getUserIdentifier,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { bold } from "../../helpers/utils";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";

const logger = _logger("play");

export enum GameType {
    ELIMINATION = "elimination",
}

const DEFAULT_LIVES = 3;

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
            if (!gameSessions[message.guildID]) {
                const textChannel = message.channel;
                const eliminationMode = parsedMessage.components.length >= 1 && parsedMessage.components[0].toLowerCase() === "elimination";
                const gameOwner = message.author;
                const lives = parsedMessage.components.length > 1 ? parseInt(parsedMessage.components[1], 10) : DEFAULT_LIVES;
                const gameSession = new GameSession(textChannel, voiceChannel, gameOwner, eliminationMode, lives);
                gameSessions[message.guildID] = gameSession;

                const lifeOrLives = lives === 1 ? "life" : "lives";
                const joinReaction = "✋";
                const startReaction = "🎵";
                const gameInstructions = eliminationMode ? `Click on ${joinReaction} to join the game. ${bold(getUserIdentifier(gameOwner))} needs to press ${startReaction} to start it! Everyone begins with ${lives} ${lifeOrLives}.` : "Listen to the song and type your guess!";
                const startTitle = `Game starting in #${textChannel.name} in 🔊 ${voiceChannel.name}`;
                const startMessage = await sendInfoMessage(message, "Use the reactions to setup the game", gameInstructions);
                if (eliminationMode) {
                    startMessage.addReaction(joinReaction);
                    startMessage.addReaction(startReaction);
                    state.client.on("messageReactionAdd", (msg, emoji, reactor) => {
                        if (msg.id !== startMessage.id || emoji.name !== startReaction || reactor !== gameOwner.id) {
                            return;
                        }
                        const participants: { [userID: string]: {tag: string, avatar: string} } = {};

                        // When startReaction pressed, get users who reacted to joinReaction and set as participants
                        Promise.resolve(state.client.getMessageReaction(textChannel.id, msg.id, joinReaction))
                            .then((reactors) => {
                                reactors.forEach((player) => {
                                    if (player.id === state.client.user.id) {
                                        return;
                                    }
                                    participants[player.id] = { tag: getUserIdentifier(player), avatar: player.avatarURL };
                                });
                                if (Object.keys(participants).length === 0) return;
                                startMessage.edit(
                                    {
                                        embed: {
                                            title: startTitle,
                                            description: gameInstructions,
                                        },
                                    },
                                );
                                gameSession.setParticipants(participants);
                                gameSession.startRound(guildPreference, message);
                                logger.info(`${getDebugContext(message)} | Game session starting (eliminationMode)`);
                            });
                    });
                } else {
                    logger.info(`${getDebugContext(message)} | Game session starting`);
                    gameSession.startRound(guildPreference, message);
                }
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
                explanation: "Start an elimination game of KMQ where each player starts with 5 lives.",
            },
            {
                example: "`!play elimination`",
                explanation: `Start an elimination game of KMQ where each player starts with ${DEFAULT_LIVES} lives.`,
            },
        ],
    };
}
