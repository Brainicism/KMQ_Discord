import * as fs from "fs";
import * as Eris from "eris";
import GuildPreference from "../models/guild_preference";
import GameSession from "../models/game_session";
import BaseCommand from "../commands/base_command";
import * as EmbedPaginator from "eris-pagination"
import _logger from "../logger";
import { getSongCount, GameOption } from "./game_utils";
import { getFact } from "../fact_generator";
import { SendMessagePayload } from "../types";
import { chunkArray, codeLine, bold } from "./utils";
import { state } from "../kmq";
const logger = _logger("utils");
export const EMBED_INFO_COLOR = 0x000000; // BLACK
export const EMBED_ERROR_COLOR = 0xE74C3C; // RED
export const EMBED_SUCCESS_COLOR = 0x00FF00; // GREEN
const EMBED_FIELDS_PER_PAGE = 20;
const REQUIRED_TEXT_PERMISSIONS = ["addReactions", "embedLinks"];
const REQUIRED_VOICE_PERMISSIONS = ["voiceConnect", "voiceSpeak"];

export async function sendSongMessage(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession, isForfeit: boolean, guesser?: string) {
    let footer: Eris.EmbedFooterOptions = null;
    const gameRound = gameSession.gameRound;
    if (!gameRound) return;
    if (gameRound.songAliases.length > 0) {
        footer = {
            text: `Aliases: ${Array.from(gameRound.songAliases).join(", ")}`
        };
    }
    let fact: string;
    if (Math.random() <= 0.3) {
        try {
            fact = await getFact();
        }
        catch (e) {
            logger.error(`${getDebugContext(message)} | Error retrieving fact. err = ${e}`);
            fact = null;
        }
    }

    let emptyScoreBoard = gameSession.scoreboard.isEmpty();
    let description = `${isForfeit ? "Nobody got it." : (`**${guesser}** guessed correctly!`)}\nhttps://youtube.com/watch?v=${gameRound.videoID} ${!emptyScoreBoard ? "\n\n**Scoreboard**" : ""}`
    const fields = gameSession.scoreboard.getScoreboard().slice(0, 10)
    if (fact) {
        fields.push({
            name: "__Fun Fact__", value: fact, inline: false
        })
    }

    await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: isForfeit ? EMBED_ERROR_COLOR : EMBED_SUCCESS_COLOR,
            author: {
                name: isForfeit ? null : message.author.username,
                icon_url: isForfeit ? null : message.author.avatarURL
            },
            title: `"${gameRound.song}" - ${gameRound.artist}`,
            description,
            thumbnail: {
                url: `https://img.youtube.com/vi/${gameRound.videoID}/hqdefault.jpg`
            },
            fields,
            footer
        }
    });
}
export async function sendInfoMessage(message: Eris.Message<Eris.GuildTextableChannel>, title: string, description?: string, footerText?: string, footerImageUrl?: string) {
    let footer: Eris.EmbedFooterOptions;
    if (footerImageUrl) {
        footer = {
            text: footerText,
            icon_url: footerImageUrl
        }
    }
    let embed = {
        color: EMBED_INFO_COLOR,
        author: {
            name: message.author.username,
            icon_url: message.author.avatarURL
        },
        title: bold(title),
        description: description,
        footer
    };
    await sendMessage({ channel: message.channel, authorId: message.author.id }, { embed });
}
export async function sendErrorMessage(message: Eris.Message<Eris.GuildTextableChannel>, title: string, description: string) {
    await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: EMBED_ERROR_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL
            },
            title: bold(title),
            description: description
        }
    });
}

export async function sendOptionsMessage(message: Eris.Message<Eris.GuildTextableChannel>, guildPreference: GuildPreference, updatedOption: string) {
    let totalSongs = await getSongCount(guildPreference);
    let groupsMode = guildPreference.getGroupIds() !== null;
    let cutoffString = `between the years ${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`;


    let genderString = `${guildPreference.getSQLGender()} artists`;
    let groupsString = groupsMode ? `${guildPreference.getGroupNames().join(", ")}` : null;
    let limitString = `${Math.min(totalSongs, guildPreference.getLimit())}`;
    let seekTypeString = `${guildPreference.getSeekType()}`;
    let modeTypeString = `${guildPreference.getModeType()}`;

    cutoffString = updatedOption == GameOption.CUTOFF ? bold(cutoffString) : codeLine(cutoffString);
    genderString = updatedOption == GameOption.GENDER ? bold(genderString) : codeLine(genderString);
    limitString = updatedOption == GameOption.LIMIT ? bold(limitString) : codeLine(limitString);
    if (groupsString && groupsString.length > 400) {
        groupsString = `${groupsString.substr(0, 400)} and many others...`;
    }
    groupsString = updatedOption == GameOption.GROUPS ? bold(groupsString) : codeLine(groupsString);
    seekTypeString = updatedOption == GameOption.SEEK_TYPE ? bold(seekTypeString) : codeLine(seekTypeString);
    modeTypeString = updatedOption == GameOption.MODE_TYPE ? bold(modeTypeString) : codeLine(modeTypeString);

    await sendInfoMessage(message,
        updatedOption == null ? "Options" : `${updatedOption} updated`,
        `Now playing the ${limitString} out of the __${totalSongs}__ most popular songs by ${groupsMode ? groupsString : genderString} ${cutoffString}. \nPlaying from the ${seekTypeString} point of each song. Guess the ${modeTypeString}'s name!`,
        updatedOption == null ? `Psst. Your bot prefix is \`${guildPreference.getBotPrefix()}\`.` : null,
        updatedOption == null ? "https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/src/assets/tsukasa.jpg" : null
    );
}

export async function sendEndGameMessage(messagePayload: SendMessagePayload, gameSession: GameSession) {
    const client = state.client;
    if (gameSession.scoreboard.isEmpty()) {
        await sendMessage(messagePayload, {
            embed: {
                color: EMBED_INFO_COLOR,
                author: {
                    name: client.user.username,
                    icon_url: client.user.avatarURL
                },
                title: "Nobody won 😔"
            }
        });
    }
    else {
        const winners = gameSession.scoreboard.getWinners();
        await sendMessage(messagePayload, {
            embed: {
                color: EMBED_SUCCESS_COLOR,
                description: "**Scoreboard**",
                thumbnail: {
                    url: client.users.get(winners[0].getId()).avatarURL
                },
                title: `🎉 ${gameSession.scoreboard.getWinnerMessage()} 🎉`,
                fields: gameSession.scoreboard.getScoreboard().slice(0, 10)
            }
        });
    }
}

export async function sendScoreboardMessage(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession) {
    if (gameSession.scoreboard.isEmpty()) {
        return sendMessage({ channel: message.channel, authorId: message.author.id }, {
            embed: {
                color: EMBED_SUCCESS_COLOR,
                author: {
                    name: message.author.username,
                    icon_url: message.author.avatarURL
                },
                description: gameSession.scoreboard.isEmpty() ? "(╯°□°）╯︵ ┻━┻" : null,
                title: "**Scoreboard**"
            }
        })
    }
    const winnersFieldSubsets = chunkArray(gameSession.scoreboard.getScoreboard(), EMBED_FIELDS_PER_PAGE);
    const embeds: Array<Eris.EmbedOptions> = winnersFieldSubsets.map((winnersFieldSubset) => ({
        color: EMBED_SUCCESS_COLOR,
        author: {
            name: message.author.username,
            icon_url: message.author.avatarURL
        },
        title: "**Scoreboard**",
        fields: winnersFieldSubset,
        footer: {
            text: `Your score is ${gameSession.scoreboard.getPlayerScore(message.author.id)}.`
        }
    }));

    return sendPaginationedEmbed(message, embeds);

}

export async function sendPaginationedEmbed(message: Eris.Message<Eris.GuildTextableChannel>, embeds: Array<Eris.EmbedOptions>) {
    if (embeds.length > 1) {
        await EmbedPaginator.createPaginationEmbed(message, embeds, { timeout: 60000 });
    }
    else {
        return sendMessage({ channel: message.channel, authorId: message.author.id }, { embed: embeds[0] });
    }
}

export function getDebugContext(message: Eris.Message): string {
    return `gid: ${message.guildID}, uid: ${message.author.id}`
}



export function disconnectVoiceConnection(message: Eris.Message<Eris.GuildTextableChannel>) {
    const voiceChannel = getVoiceChannel(message);
    if (voiceChannel) {
        logger.info(`${getDebugContext(message)} | Disconnected from voice channel`);
        voiceChannel.leave();
    }
}

export function getUserIdentifier(user: Eris.User): string {
    return `${user.username}#${user.discriminator}`
}


export function areUserAndBotInSameVoiceChannel(message: Eris.Message): boolean {
    const botVoiceConnection = getVoiceConnection(message);
    if (!message.member.voiceState || !botVoiceConnection) {
        return false;
    }
    return message.member.voiceState.channelID === botVoiceConnection.channelID;
}

export function getNumParticipants(message: Eris.Message<Eris.GuildTextableChannel>): number {
    // Don't include the bot as a participant
    return (getVoiceChannel(message).voiceMembers.filter(x => !x.bot)).length;
}

export function getVoiceChannel(message: Eris.Message<Eris.GuildTextableChannel>): Eris.VoiceChannel {
    const voiceChannel = message.channel.guild.channels.get(message.member.voiceState.channelID) as Eris.VoiceChannel;
    return voiceChannel;
}

export function getVoiceConnection(message: Eris.Message): Eris.VoiceConnection {
    const voiceConnection = state.client.voiceConnections.get(message.guildID);
    return voiceConnection;
}

export async function sendEmbed(messagePayload: SendMessagePayload, embed: Eris.EmbedOptions) {
    return sendMessage(messagePayload, { embed });
}

export async function sendMessage(messagePayload: SendMessagePayload, messageContent: Eris.MessageContent): Promise<Eris.Message> {
    const channel = messagePayload.channel;
    return state.client.createMessage(channel.id, messageContent);
}

export function voicePermissionsCheck(message: Eris.Message<Eris.GuildTextableChannel>): boolean {
    const voiceChannel = getVoiceChannel(message);
    const missingPermissions = REQUIRED_VOICE_PERMISSIONS.filter((permission) => !voiceChannel.permissionsOf(state.client.user.id).has(permission));
    if (missingPermissions.length > 0) {
        logger.warn(`gid: ${voiceChannel.guild.id}, uid: ${message.author.id} | Missing [${missingPermissions.join(", ")}] permissions`);
        sendErrorMessage(message, "Missing Permissions", `Ensure that the bot has the following permissions: \`${missingPermissions.join(", ")}\``)
        return false;
    }
    const channelFull = voiceChannel.userLimit && (voiceChannel.voiceMembers.size >= voiceChannel.userLimit);
    if (channelFull) {
        logger.warn(`gid: ${voiceChannel.guild.id}, uid: ${message.author.id} | Channel full`);
        sendInfoMessage(message, "Voice Channel Full", "Ensure that there's enough space in the voice channel for me to join");
        return false;
    }
    return true;
}

export async function textPermissionsCheck(message: Eris.Message<Eris.GuildTextableChannel>): Promise<boolean> {
    const channel = message.channel;
    const client = state.client;
    if (!channel.permissionsOf(client.user.id).has("sendMessages")) {
        logger.warn(`gid: ${channel.guild.id}, uid: ${message.author.id} | Missing SEND_MESSAGES permissions`);
        const embed = {
            color: EMBED_INFO_COLOR,
            title: `Missing Permissions`,
            description: `Hi! I'm unable to message in ${channel.guild.name}'s #${channel.name} channel. Please double check the text channel's permissions.`,
        }
        const dmChannel = await client.getDMChannel(message.author.id);
        await client.createMessage(dmChannel.id, { embed });
        return;
    }

    const missingPermissions = REQUIRED_TEXT_PERMISSIONS.filter((permission) => !channel.permissionsOf(client.user.id).has(permission));
    if (missingPermissions.length > 0) {
        logger.warn(`gid: ${channel.guild.id}, uid: ${message.author.id} | Missing [${missingPermissions.join(", ")}] permissions`);
        client.createMessage(channel.id, {
            content: `Missing Permissions:\nEnsure that the bot has the following permissions: \`${missingPermissions.join(", ")}\``
        })
        return false;
    }
    return true;
}

export async function checkBotIsAlone(gameSession: GameSession, channel: Eris.VoiceChannel) {
    if (channel.voiceMembers.size === 1 && channel.voiceMembers.has(state.client.user.id)) {
        if (gameSession) {
            logger.info(`gid: ${channel.guild.id} | Bot is only user left, leaving voice...`)
            sendEndGameMessage({ channel: gameSession.textChannel }, gameSession);
            await gameSession.endSession();
        }
        return;
    }
}
