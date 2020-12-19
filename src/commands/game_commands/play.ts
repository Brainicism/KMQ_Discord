import GameSession from "../../models/game_session";
import state from "../../kmq";
import {
    sendErrorMessage, getDebugContext, sendInfoMessage, getVoiceChannel, voicePermissionsCheck, getUserIdentifier,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { bold } from "../../helpers/utils";
import { deleteGameSession } from "../../helpers/management_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import EliminationScoreboard from "../../models/elimination_scoreboard";
import _logger from "../../logger";

const logger = _logger("play");

export enum GameType {
    CLASSIC = "classic",
    ELIMINATION = "elimination",
}

const DEFAULT_LIVES = 3;
const JOIN_REACTION = "✋";
const START_REACTION = "🎵";

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
            const eliminationMode = parsedMessage.components.length >= 1 && parsedMessage.components[0].toLowerCase() === "elimination";
            if (gameSessions[message.guildID] && gameSessions[message.guildID].eliminationMode) {
                const eliminationScoreboard = gameSessions[message.guildID].scoreboard as EliminationScoreboard;
                if (eliminationScoreboard.numberOfPlayers() === 0) {
                    // Game didn't really start (user trying to call ,play again), re-initialize GameSession
                    if (eliminationMode) {
                        gameSessions[message.guildID].deleteStartMessage();
                    }
                    deleteGameSession(message.guildID);
                }
            }
            if (!gameSessions[message.guildID]) {
                const textChannel = message.channel;
                const gameOwner = message.author;
                const lives = parsedMessage.components.length > 1 ? parseInt(parsedMessage.components[1], 10) : DEFAULT_LIVES;
                const gameInstructions = eliminationMode ? `Click on ${JOIN_REACTION} to join the game. ${bold(getUserIdentifier(gameOwner))} needs to press ${START_REACTION} to start it! Everyone begins with ${lives} lives.` : "Listen to the song and type your guess!";
                const startTitle = `Game starting in #${textChannel.name} in 🔊 ${voiceChannel.name}`;
                const reactionsTitle = "Use the reactions to setup the game";
                const startMessage = await sendInfoMessage(message, eliminationMode ? reactionsTitle : startTitle, gameInstructions);
                if (!gameSessions[message.guildID]) {
                    gameSessions[message.guildID] = new GameSession(textChannel, voiceChannel, gameOwner, eliminationMode, lives, startMessage);
                }

                if (eliminationMode) {
                    startMessage.addReaction(JOIN_REACTION);
                    startMessage.addReaction(START_REACTION);
                    state.client.on("messageReactionAdd", async function startOnReaction(msg, emoji, reactor) {
                        if (msg.id !== startMessage.id || emoji.name !== START_REACTION || reactor !== gameOwner.id) {
                            return;
                        }

                        // When START_REACTION pressed, get users who reacted to JOIN_REACTION and set as participants
                        const reactors = await state.client.getMessageReaction(textChannel.id, msg.id, JOIN_REACTION);
                        const participants = reactors
                            .filter((x) => x.id !== state.client.user.id)
                            .reduce((acc, player) => {
                                acc[player.id] = { tag: getUserIdentifier(player), avatar: player.avatarURL };
                                return acc;
                            }, {});
                        if (Object.keys(participants).length === 0) return;
                        state.client.removeListener("messageReactionAdd", startOnReaction);
                        startMessage.edit(
                            {
                                embed: {
                                    title: startTitle,
                                    description: gameInstructions,
                                },
                            },
                        );
                        gameSessions[message.guildID].setParticipants(participants);
                        gameSessions[message.guildID].startRound(guildPreference, message);
                        logger.info(`${getDebugContext(message)} | Game session starting (eliminationMode)`);
                    });
                } else {
                    logger.info(`${getDebugContext(message)} | Game session starting`);
                    gameSessions[message.guildID].startRound(guildPreference, message);
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
                explanation: `Start an elimination game of KMQ where each player starts with \`${DEFAULT_LIVES}\` lives.`,
            },
        ],
    };
}
