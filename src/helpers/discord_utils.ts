import Eris from "eris";
import EmbedPaginator from "eris-pagination";
import GuildPreference from "../models/guild_preference";
import GameSession from "../models/game_session";
import _logger from "../logger";
import { endSession, getSongCount } from "./game_utils";
import getFact from "../fact_generator";
import { GameOption, SendMessagePayload } from "../types";
import { chunkArray, codeLine, bold } from "./utils";
import state from "../kmq";
import { ModeType } from "../commands/game_options/mode";
import Scoreboard from "../models/scoreboard";
import GameRound from "../models/game_round";
import EliminationScoreboard from "../models/elimination_scoreboard";
import { GameType } from "../commands/game_commands/play";

const logger = _logger("utils");
export const EMBED_INFO_COLOR = 0x000000; // BLACK
export const EMBED_ERROR_COLOR = 0xE74C3C; // RED
export const EMBED_SUCCESS_COLOR = 0x00FF00; // GREEN
const EMBED_FIELDS_PER_PAGE = 20;
const REQUIRED_TEXT_PERMISSIONS = ["addReactions", "embedLinks"];
const REQUIRED_VOICE_PERMISSIONS = ["voiceConnect", "voiceSpeak"];

export function getDebugContext(message: Eris.Message): string {
    return `gid: ${message.guildID}, uid: ${message.author.id}`;
}

export async function sendMessage(messagePayload: SendMessagePayload, messageContent: Eris.MessageContent): Promise<Eris.Message> {
    const { channel } = messagePayload;
    return state.client.createMessage(channel.id, messageContent);
}

export async function sendSongMessage(message: Eris.Message<Eris.GuildTextableChannel>, scoreboard: Scoreboard, gameRound: GameRound, isForfeit: boolean, guesser?: string) {
    let footer: Eris.EmbedFooterOptions = null;
    if (gameRound.songAliases.length > 0) {
        footer = {
            text: `Aliases: ${Array.from(gameRound.songAliases).join(", ")}`,
        };
    }
    let fact: string;
    if (Math.random() <= 0.05) {
        try {
            fact = await getFact();
        } catch (e) {
            logger.error(`${getDebugContext(message)} | Error retrieving fact. err = ${e}`);
            fact = null;
        }
    }

    const emptyScoreBoard = scoreboard.isEmpty();
    const description = `${isForfeit ? "Nobody got it." : (`**${guesser}** guessed correctly!`)}\nhttps://youtube.com/watch?v=${gameRound.videoID} ${!emptyScoreBoard ? "\n\n**Scoreboard**" : ""}`;
    const fields = scoreboard.getScoreboardEmbedFields().slice(0, 10);
    if (fact) {
        fields.push({
            name: "__Did you know?__", value: fact, inline: false,
        });
    }

    await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: isForfeit ? EMBED_ERROR_COLOR : EMBED_SUCCESS_COLOR,
            author: {
                name: isForfeit ? null : message.author.username,
                icon_url: isForfeit ? null : message.author.avatarURL,
            },
            title: `"${gameRound.song}" - ${gameRound.artist}`,
            description,
            thumbnail: {
                url: `https://img.youtube.com/vi/${gameRound.videoID}/hqdefault.jpg`,
            },
            fields,
            footer,
        },
    });
}

export async function sendErrorMessage(message: Eris.Message<Eris.GuildTextableChannel>, title: string, description: string) {
    await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: EMBED_ERROR_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL,
            },
            title: bold(title),
            description,
        },
    });
}

export async function sendInfoMessage(message: Eris.Message<Eris.GuildTextableChannel>, title: string, description?: string, footerText?: string) {
    if (description.length > 2048) {
        await sendErrorMessage(message, "Error", "Response message was too long, report this error to the KMQ help server");
        return;
    }
    let footer: Eris.EmbedFooterOptions;
    if (footerText) {
        footer = {
            text: footerText,
        };
    }
    const embed = {
        color: EMBED_INFO_COLOR,
        author: {
            name: message.author.username,
            icon_url: message.author.avatarURL,
        },
        title: bold(title),
        description,
        footer,
    };
    await sendMessage({ channel: message.channel, authorId: message.author.id }, { embed });
}

export async function sendOptionsMessage(message: Eris.Message<Eris.GuildTextableChannel>, guildPreference: GuildPreference, updatedOption: string, footerText?: string) {
    const totalSongs = await getSongCount(guildPreference);
    if (totalSongs === -1) {
        sendErrorMessage(message, "Error retrieving song data", `Try again in a bit, or report this error to the support server found in \`${process.env.BOT_PREFIX}help\`.`);
        return;
    }

    const { gameSessions } = state;
    const isEliminationMode = gameSessions[message.guildID] && gameSessions[message.guildID].gameType === GameType.ELIMINATION;

    const goalMode = guildPreference.isGoalSet() && !isEliminationMode;
    const guessTimeoutMode = guildPreference.isGuessTimeoutSet();
    const shuffleUniqueMode = guildPreference.isShuffleUnique();

    const optionStrings = {};
    optionStrings[GameOption.CUTOFF] = `between the years ${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`;
    optionStrings[GameOption.GENDER] = `${guildPreference.getSQLGender()} artists`;
    optionStrings[GameOption.GROUPS] = guildPreference.isGroupsMode() ? `${guildPreference.getDisplayedGroupNames()}` : null;
    optionStrings[GameOption.EXCLUDE] = guildPreference.isExcludesMode() ? `${guildPreference.getDisplayedExcludesGroupNames()}` : null;
    optionStrings[GameOption.LIMIT] = `${Math.min(totalSongs, guildPreference.getLimit())}`;
    optionStrings[GameOption.SEEK_TYPE] = `${guildPreference.getSeekType()}`;
    optionStrings[GameOption.MODE_TYPE] = `${guildPreference.getModeType() === ModeType.BOTH ? "song or artist" : guildPreference.getModeType()}`;
    optionStrings[GameOption.GOAL] = `${guildPreference.getGoal()}`;
    optionStrings[GameOption.TIMER] = `${guildPreference.getGuessTimeout()}`;
    optionStrings[GameOption.SHUFFLE_TYPE] = `${guildPreference.getShuffleType()}`;

    for (const gameOption of Object.keys(optionStrings)) {
        const gameOptionString = optionStrings[gameOption];
        optionStrings[gameOption] = updatedOption === gameOption ? bold(gameOptionString) : codeLine(gameOptionString);
    }

    const goalMessage = `First one to ${optionStrings[GameOption.GOAL]} points wins.`;
    const guessTimeoutMessage = ` in less than ${optionStrings[GameOption.TIMER]} seconds`;
    const shuffleMessage = `Songs will be shuffled in ${optionStrings[GameOption.SHUFFLE_TYPE]} order. `;

    await sendInfoMessage(message,
        updatedOption === null ? "Options" : `${updatedOption} updated`,
        `Now playing the ${optionStrings[GameOption.LIMIT]} out of the __${totalSongs}__ most popular songs by ${guildPreference.isGroupsMode() ? optionStrings[GameOption.GROUPS] : optionStrings[GameOption.GENDER]} ${optionStrings[GameOption.CUTOFF]}\
        ${guildPreference.isExcludesMode() ? ` excluding ${optionStrings[GameOption.EXCLUDE]}` : ""}. \nPlaying from the ${optionStrings[GameOption.SEEK_TYPE]} point of each song. ${shuffleUniqueMode ? shuffleMessage : ""}\
        Guess the ${optionStrings[GameOption.MODE_TYPE]}'s name${guessTimeoutMode ? guessTimeoutMessage : ""}! ${goalMode ? goalMessage : ""}`,
        footerText !== null ? footerText : null);
}

export async function sendEndGameMessage(messagePayload: SendMessagePayload, gameSession: GameSession) {
    const { client } = state;
    if (gameSession.scoreboard.isEmpty()) {
        await sendMessage(messagePayload, {
            embed: {
                color: EMBED_INFO_COLOR,
                author: {
                    name: client.user.username,
                    icon_url: client.user.avatarURL,
                },
                title: "Nobody won 😔",
            },
        });
    } else {
        const winners = gameSession.scoreboard.getWinners();
        const embedFields = gameSession.scoreboard.getScoreboardEmbedFields().slice(0, 10);
        embedFields.push(
            {
                name: "Like KMQ?",
                value: "Give us a vote and leave a review on [Top.GG!](https://top.gg/bot/508759831755096074)",
                inline: false,
            },
        );
        await sendMessage(messagePayload, {
            embed: {
                color: EMBED_SUCCESS_COLOR,
                description: "**Scoreboard**",
                thumbnail: {
                    url: winners[0].getAvatarURL(),
                },
                title: `🎉 ${gameSession.scoreboard.getWinnerMessage()} 🎉`,
                fields: embedFields,
            },
        });
    }
}

export async function sendPaginationedEmbed(message: Eris.Message<Eris.GuildTextableChannel>, embeds: Array<Eris.EmbedOptions>) {
    if (embeds.length > 1) {
        return EmbedPaginator.createPaginationEmbed(message, embeds, { timeout: 60000 });
    }
    return sendMessage({ channel: message.channel, authorId: message.author.id }, { embed: embeds[0] });
}

export async function sendScoreboardMessage(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession) {
    if (gameSession.scoreboard.isEmpty() && gameSession.gameType === GameType.CLASSIC) {
        return sendMessage({ channel: message.channel, authorId: message.author.id }, {
            embed: {
                color: EMBED_SUCCESS_COLOR,
                author: {
                    name: message.author.username,
                    icon_url: message.author.avatarURL,
                },
                description: "(╯°□°）╯︵ ┻━┻",
                title: "**Scoreboard**",
            },
        });
    }
    const winnersFieldSubsets = chunkArray(gameSession.scoreboard.getScoreboardEmbedFields(), EMBED_FIELDS_PER_PAGE);
    let footerText = `Your score is ${gameSession.scoreboard.getPlayerScore(message.author.id)}.`;
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
        footerText = `You have ${eliminationScoreboard.getPlayerLives(message.author.id)} lives.`;
    }
    const embeds: Array<Eris.EmbedOptions> = winnersFieldSubsets.map((winnersFieldSubset) => ({
        color: EMBED_SUCCESS_COLOR,
        author: {
            name: message.author.username,
            icon_url: message.author.avatarURL,
        },
        title: "**Scoreboard**",
        fields: winnersFieldSubset,
        footer: {
            text: footerText,
        },
    }));

    return sendPaginationedEmbed(message, embeds);
}

export function disconnectVoiceConnection(message: Eris.Message<Eris.GuildTextableChannel>) {
    state.client.closeVoiceConnection(message.guildID);
}

export function getUserIdentifier(user: Eris.User): string {
    return `${user.username}#${user.discriminator}`;
}

export function getVoiceConnection(message: Eris.Message): Eris.VoiceConnection {
    const voiceConnection = state.client.voiceConnections.get(message.guildID);
    return voiceConnection;
}

export function areUserAndBotInSameVoiceChannel(message: Eris.Message): boolean {
    const botVoiceConnection = getVoiceConnection(message);
    if (!message.member.voiceState || !botVoiceConnection) {
        return false;
    }
    return message.member.voiceState.channelID === botVoiceConnection.channelID;
}

export function getVoiceChannel(message: Eris.Message<Eris.GuildTextableChannel>): Eris.VoiceChannel {
    const voiceChannel = message.channel.guild.channels.get(message.member.voiceState.channelID) as Eris.VoiceChannel;
    return voiceChannel;
}

export function getNumParticipants(message: Eris.Message<Eris.GuildTextableChannel>): number {
    // Don't include the bot as a participant
    return (getVoiceChannel(message).voiceMembers.filter((x) => !x.bot)).length;
}

export async function sendEmbed(messagePayload: SendMessagePayload, embed: Eris.EmbedOptions) {
    return sendMessage(messagePayload, { embed });
}

function missingPermissionsText(missingPermissions: string[]): string {
    return `Ensure that the bot has the following permissions: \`${missingPermissions.join(", ")}\`\n\nSee the following link for details: https://support.discord.com/hc/en-us/articles/206029707-How-do-I-set-up-Permissions-. If you are still having issues, join the support server found in \`${process.env.BOT_PREFIX}help\``;
}

export function voicePermissionsCheck(message: Eris.Message<Eris.GuildTextableChannel>): boolean {
    const voiceChannel = getVoiceChannel(message);
    const missingPermissions = REQUIRED_VOICE_PERMISSIONS.filter((permission) => !voiceChannel.permissionsOf(state.client.user.id).has(permission));
    if (missingPermissions.length > 0) {
        logger.warn(`gid: ${voiceChannel.guild.id}, uid: ${message.author.id} | Missing [${missingPermissions.join(", ")}] permissions`);
        sendErrorMessage(message, "Missing Permissions", missingPermissionsText(missingPermissions));
        return false;
    }
    const channelFull = voiceChannel.userLimit && (voiceChannel.voiceMembers.size >= voiceChannel.userLimit);
    if (channelFull) {
        logger.warn(`gid: ${voiceChannel.guild.id}, uid: ${message.author.id} | Channel full`);
        sendInfoMessage(message, "Voice Channel Full", "Ensure that there's enough room in the voice channel for me to join");
        return false;
    }
    const afkChannel = voiceChannel.id === voiceChannel.guild.afkChannelID;
    if (afkChannel) {
        logger.warn(`gid: ${voiceChannel.guild.id}, uid: ${message.author.id} | Attempted to start game in AFK voice channel`);
        sendInfoMessage(message, "AFK Voice Channel", "Ensure you're not in the inactive voice channel so that you can hear me!");
        return false;
    }
    return true;
}

export async function textPermissionsCheck(message: Eris.Message<Eris.GuildTextableChannel>): Promise<boolean> {
    const { channel } = message;
    const { client } = state;

    if (!channel.permissionsOf(client.user.id).has("sendMessages")) {
        logger.warn(`gid: ${channel.guild.id}, uid: ${message.author.id} | Missing SEND_MESSAGES permissions`);
        const embed = {
            color: EMBED_INFO_COLOR,
            title: "Missing Permissions",
            description: `Hi! I'm unable to message in ${channel.guild.name}'s #${channel.name} channel. Please make sure the bot has permissions to message in this channel.`,
        };
        const dmChannel = await client.getDMChannel(message.author.id);
        await client.createMessage(dmChannel.id, { embed });
        return false;
    }

    const missingPermissions = REQUIRED_TEXT_PERMISSIONS.filter((permission) => !channel.permissionsOf(client.user.id).has(permission));
    if (missingPermissions.length > 0) {
        logger.warn(`gid: ${channel.guild.id}, uid: ${message.author.id} | Missing [${missingPermissions.join(", ")}] permissions`);
        client.createMessage(channel.id, {
            content: missingPermissionsText(missingPermissions),
        });
        return false;
    }
    return true;
}

export async function checkBotIsAlone(gameSession: GameSession, channel: Eris.VoiceChannel) {
    if (channel.voiceMembers.size === 1 && channel.voiceMembers.has(state.client.user.id)) {
        if (gameSession) {
            logger.info(`gid: ${channel.guild.id} | Bot is only user left, leaving voice...`);
            endSession({ channel: gameSession.textChannel }, gameSession);
        }
    }
}

export function getDebugChannel(): Eris.TextChannel {
    if (!process.env.DEBUG_SERVER_ID || !process.env.DEBUG_TEXT_CHANNEL_ID) return null;
    return <Eris.TextChannel>state.client.guilds.get(process.env.DEBUG_SERVER_ID)
        .channels.get(process.env.DEBUG_TEXT_CHANNEL_ID);
}

export function getSqlDateString(timeInMs?: number): string {
    if (timeInMs) {
        return new Date(timeInMs).toISOString().slice(0, 19).replace("T", " ");
    }
    return new Date().toISOString().slice(0, 19).replace("T", " ");
}
