import Eris from "eris";
import GameSession from "../../structures/game_session";
import {
    sendErrorMessage, getDebugLogHeader, sendInfoMessage, voicePermissionsCheck, getUserVoiceChannel, getUserTag, getCurrentVoiceMembers,
} from "../../helpers/discord_utils";
import { deleteGameSession, getTimeUntilRestart } from "../../helpers/management_utils";
import { activeBonusUsers, getGuildPreference } from "../../helpers/game_utils";
import { bold, chooseWeightedRandom, isPowerHour, isWeekend } from "../../helpers/utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import dbContext from "../../database_context";
import { IPCLogger } from "../../logger";
import { GameInfoMessage, GameType, GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";

const logger = new IPCLogger("play");
const DEFAULT_LIVES = 10;

export async function sendBeginGameMessage(textChannelName: string,
    voiceChannelName: string,
    message: GuildTextableMessage,
    participants: Array<{ id: string, username: string, discriminator: string }>) {
    let gameInstructions = "Listen to the song and type your guess!";
    const bonusUsers = await activeBonusUsers();
    const bonusUserParticipants = participants.filter((x) => bonusUsers.has(x.id));
    if (bonusUserParticipants.length > 0) {
        let bonusUserTags = bonusUserParticipants.map((x) => `\`${getUserTag(x)}\``);
        if (bonusUserTags.length > 10) {
            bonusUserTags = bonusUserTags.slice(0, 10);
            bonusUserTags.push("and many others");
        }

        gameInstructions += `\n\n${bonusUserTags.join(", ")} will receive double EXP for [voting](https://top.gg/bot/508759831755096074/vote)! See \`,vote\` for info on how to vote. Thanks for supporting KMQ!`;
    }

    if (isWeekend()) {
        gameInstructions += "\n\n**⬆️ DOUBLE EXP WEEKEND ACTIVE ⬆️**";
    } else if (isPowerHour()) {
        gameInstructions += "\n\n**⬆️ KMQ POWER HOUR ACTIVE ⬆️**";
    }

    const startTitle = `Game starting in #${textChannelName} in 🔊 ${voiceChannelName}`;
    const gameInfoMessage: GameInfoMessage = chooseWeightedRandom(await dbContext.kmq("game_messages"));
    const fields: Eris.EmbedField[] = [];
    if (gameInfoMessage) {
        fields.push(
            {
                name: gameInfoMessage.title,
                value: gameInfoMessage.message,
                inline: false,
            },
        );
    }

    await sendInfoMessage(MessageContext.fromMessage(message), {
        title: startTitle,
        description: gameInstructions,
        footerText: bonusUserParticipants.length === 0 && Math.random() < 0.5 ? "Psst. Earn more EXP by voting (see ,vote)" : null,
        thumbnailUrl: KmqImages.HAPPY,
        fields,
    });
}

export default class PlayCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [],
    };

    aliases = ["random", "start", "p"];

    help = {
        name: "play",
        description: "Starts a game of KMQ. Pick between classic (default), elimination mode, and teams mode.",
        usage: ",play {classic | elimination | teams}\n,play elimination [lives]",
        priority: 1050,
        examples: [
            {
                example: "`,play`",
                explanation: "Start a classic game of KMQ (type in your guess first to get a point)",
            },
            {
                example: "`,play elimination 5`",
                explanation: "Start an elimination game of KMQ where each player starts with `5` lives.",
            },
            {
                example: "`,play elimination`",
                explanation: `Start an elimination game of KMQ where each player starts with \`${DEFAULT_LIVES}\` lives.`,
            },
            {
                example: "`,play teams`",
                explanation: "Split up into as many teams as you want and see who you can depend on to help you win!",
            },
        ],
    };

    call = async ({ message, gameSessions, parsedMessage, channel }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        const voiceChannel = getUserVoiceChannel(MessageContext.fromMessage(message));
        const timeUntilRestart = await getTimeUntilRestart();
        if (timeUntilRestart) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Cannot start new game", description: `Bot is restarting in \`${timeUntilRestart}\` minutes, please wait until the bot is back up!` });
            return;
        }

        if (!voiceChannel) {
            await sendErrorMessage(MessageContext.fromMessage(message),
                {
                    title: "Join a voice channel",
                    description: `Send \`${process.env.BOT_PREFIX}play\` again when you are in a voice channel.`,
                });
            logger.warn(`${getDebugLogHeader(message)} | User not in voice channel`);
            return;
        }

        if (!voicePermissionsCheck(message)) {
            return;
        }

        const isEliminationMode = parsedMessage.components.length >= 1 && parsedMessage.components[0].toLowerCase() === "elimination";
        const isTeamsMode = parsedMessage.components.length >= 1 && parsedMessage.components[0].toLowerCase() === "teams";

        if (gameSessions[message.guildID] && !gameSessions[message.guildID].sessionInitialized && (isEliminationMode || isTeamsMode)) {
            // User sent ,play elimination or ,play teams twice, reset the GameSession
            deleteGameSession(message.guildID);
        }

        const messageContext = MessageContext.fromMessage(message);
        const prefix = process.env.BOT_PREFIX;

        if (!gameSessions[message.guildID] || !gameSessions[message.guildID].sessionInitialized) {
            // (1) No game session exists yet (create MC, ELIMINATION, TEAMS, or CLASSIC game), or
            // (2) User attempting to ,play after a ,play elimination/teams that didn't start, start CLASSIC game
            const textChannel = channel;
            const gameOwner = KmqMember.fromUser(message.author);
            let gameSession: GameSession;

            if (isEliminationMode) {
                // (1) ELIMINATION game creation
                const lives = (parsedMessage.components.length > 1
                    && Number.isInteger(parseInt(parsedMessage.components[1]))
                    && parseInt(parsedMessage.components[1]) > 0
                    && parseInt(parsedMessage.components[1]) <= 10000)
                    ? parseInt(parsedMessage.components[1]) : DEFAULT_LIVES;

                const startTitle = `\`${prefix}join\` the game and start it with \`${prefix}begin\`!`;
                const gameInstructions = `Type \`${prefix}join\` to play in the upcoming elimination game. Once all have joined, ${bold(gameOwner.tag)} must send \`${prefix}begin\` to start the game. Everyone begins with \`${lives}\` lives.`;

                gameSession = new GameSession(textChannel.id, voiceChannel.id, textChannel.guild.id, gameOwner, GameType.ELIMINATION, lives);
                gameSession.addEliminationParticipant(gameOwner);
                await sendInfoMessage(messageContext, { title: startTitle, description: gameInstructions, thumbnailUrl: KmqImages.HAPPY });
            } else if (isTeamsMode) {
                // (1) TEAMS game creation
                const startTitle = `\`${prefix}join\` a team!`;
                const gameInstructions = `Team leaders, type \`${prefix}join [team name]\` to form a new team. Remember, switching teams mid-game will forfeit all your current score and EXP.`;

                await sendInfoMessage(messageContext, { title: startTitle, description: gameInstructions, thumbnailUrl: KmqImages.HAPPY });
                gameSession = new GameSession(textChannel.id, voiceChannel.id, textChannel.guild.id, gameOwner, GameType.TEAMS);
            } else {
                // (1 and 2) CLASSIC game creation
                if (gameSessions[message.guildID]) {
                    // (2) Let the user know they're starting a non-elimination/teams game
                    const oldGameType = gameSessions[message.guildID].gameType;
                    const ignoringOldGameTypeTitle = `Ignoring \`${prefix}play ${oldGameType}\``;
                    const gameSpecificInstructions = oldGameType === GameType.ELIMINATION ? `\`${prefix}join\` the game` : `\`${prefix}join [team name]\` a team`;
                    const oldGameTypeInstructions = `If you meant to start a \`${oldGameType}\` game, \`${prefix}end\` this game, call \`${prefix}play ${oldGameType}\`, ${gameSpecificInstructions}, and then call \`${prefix}begin\`.`;

                    sendErrorMessage(messageContext, { title: ignoringOldGameTypeTitle, description: oldGameTypeInstructions, thumbnailUrl: KmqImages.DEAD });
                }

                gameSession = new GameSession(textChannel.id, voiceChannel.id, textChannel.guild.id, gameOwner, GameType.CLASSIC);
                await sendBeginGameMessage(textChannel.name, voiceChannel.name, message, getCurrentVoiceMembers(voiceChannel.id));
                gameSession.startRound(guildPreference, messageContext);
                logger.info(`${getDebugLogHeader(message)} | Game session starting`);
            }

            gameSessions[message.guildID] = gameSession;
        } else {
            await sendErrorMessage(messageContext, { title: "Game already in session" });
        }
    };
}
