import * as fs from "fs";
import { Pool } from "promise-mysql"
import * as path from "path";
import * as Discord from "discord.js";
import GuildPreference from "models/guild_preference";
import GameSession from "../models/game_session";
import BaseCommand from "commands/base_command";
import _logger from "../logger";
import { getSongCount, GameOptions } from "./game_utils";
const logger = _logger("utils");
const EMBED_INFO_COLOR = 0x000000; // BLACK
const EMBED_ERROR_COLOR = 0xE74C3C; // RED

const sendSongMessage = async (message: Discord.Message, gameSession: GameSession, isForfeit: boolean) => {
    await sendMessage(message, {
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: isForfeit ? null : message.author.username,
                icon_url: isForfeit ? null : message.author.avatarURL
            },
            title: `"${gameSession.getSong()}" - ${gameSession.getArtist()}`,
            description: `https://youtube.com/watch?v=${gameSession.getVideoID()}\n\n**Scoreboard**`,
            image: {
                url: `https://img.youtube.com/vi/${gameSession.getVideoID()}/hqdefault.jpg`
            },
            fields: gameSession.scoreboard.getScoreboard()
        }
    });
}
const sendInfoMessage = async (message: Discord.Message, title: string, description?: string, footerText?: string, footerImageWithPath?: string) => {
    let embed = new Discord.RichEmbed({
        color: EMBED_INFO_COLOR,
        author: {
            name: message.author.username,
            icon_url: message.author.avatarURL
        },
        title: bold(title),
        description: description
    })

    if (footerImageWithPath) {
        embed.attachFiles([footerImageWithPath]);
        let footerImage = path.basename(footerImageWithPath);
        embed.setFooter(footerText, `attachment://${footerImage}`)
    }
    await sendMessage(message, embed);
}
const sendErrorMessage = async (message: Discord.Message, title: string, description: string) => {
    await sendMessage(message, {
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

const sendOptionsMessage = async (message: Discord.Message, guildPreference: GuildPreference, db: Pool, updatedOption: string) => {
    let cutoffString = `between the years ${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`;
    let genderString = `${guildPreference.getSQLGender()}`;
    let limitString = `${guildPreference.getLimit()}`;
    let volumeString = `${guildPreference.getVolume()}`;
    let seekTypeString = `${guildPreference.getSeekType()}`

    cutoffString = updatedOption == GameOptions.CUTOFF ? bold(cutoffString) : codeLine(cutoffString);
    genderString = updatedOption == GameOptions.GENDER ? bold(genderString) : codeLine(genderString);
    limitString = updatedOption == GameOptions.LIMIT ? bold(limitString) : codeLine(limitString);
    volumeString = updatedOption == GameOptions.VOLUME ? bold(volumeString) : codeLine(volumeString);
    seekTypeString = updatedOption == GameOptions.SEEK_TYPE ? bold(seekTypeString) : codeLine(seekTypeString);

    let totalSongs = await getSongCount(guildPreference, db);
    await sendInfoMessage(message,
        updatedOption == null ? "Options" : `${updatedOption} updated`,
        `Now playing the ${limitString} out of the __${totalSongs}__ most popular songs  by ${genderString} artists ${cutoffString}. \nPlaying from the ${seekTypeString} point of each song and at ${volumeString}% volume.`,
        updatedOption == null ? `Psst. Your bot prefix is \`${guildPreference.getBotPrefix()}\`.` : null,
        updatedOption == null ? "assets/tsukasa.jpg" : null
    );
}
const getDebugContext = (message: Discord.Message): string => {
    return `gid: ${message.guild.id}, uid: ${message.author.id}`
}

const getCommandFiles = (): Promise<{ [commandName: string]: BaseCommand }> => {
    return new Promise(async (resolve, reject) => {
        let commandMap = {};
        let files: Array<string>;
        try {
            files = await fs.promises.readdir("./commands");
        }
        catch (err) {
            reject();
            return logger.error(`Unable to read commands error = ${err}`);
        }

        for (const file of files) {
            let command = await import(`../commands/${file}`);
            let commandName = file.split(".")[0];
            commandMap[commandName] = new command.default()
        }
        resolve(commandMap);

    })
}

const bold = (text: string): string => {
    return `**${text}**`;
}

const italicize = (text: string): string => {
    return `*${text}*`;
}

const codeLine = (text: string): string => {
    return `\`${text}\``
}

const touch = (filePath: string) => {
    try {
        let currentTime = new Date();
        fs.utimesSync(filePath, currentTime, currentTime);
    } catch (err) {
        fs.closeSync(fs.openSync(filePath, "w"));
    }
}

const arraysEqual = (arr1: Array<any>, arr2: Array<any>): boolean => {
    if (arr1.length !== arr2.length) {
        return false;
    }

    arr1 = arr1.concat().sort();
    arr2 = arr2.concat().sort();

    for (var i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }
    return true;
}

export function disconnectVoiceConnection(client: Discord.Client, message: Discord.Message) {
    let voiceConnection = client.voiceConnections.get(message.guild.id);
    if (voiceConnection) {
        logger.info(`${getDebugContext(message)} | Disconnected from voice channel`);
        voiceConnection.disconnect();
        return;
    }
}

export function getUserIdentifier(user: Discord.User): string {
    return `${user.username}#${user.discriminator}`
}


export function areUserAndBotInSameVoiceChannel(message: Discord.Message): boolean {
    if (!message.member.voiceChannel || !message.guild.voiceConnection.channel) {
        return false;
    }
    return message.member.voiceChannel === message.guild.voiceConnection.channel;
}

export function getNumParticipants(message: Discord.Message): number {
    // Don't include the bot as a participant
    return message.member.voiceChannel.members.size - 1;
}

export async function sendMessage(context: Discord.Message, messageContent: any): Promise<Discord.Message> {
    const channel: Discord.TextChannel = context.channel as Discord.TextChannel;
    if (!channel.permissionsFor(context.guild.me.user).has("SEND_MESSAGES")) {
        logger.warn(`${getDebugContext(context)} | Missing SEND_MESSAGES permissions`);
        let embed = {
            color: EMBED_INFO_COLOR,
            title: `Missing Permissions`,
            description: `Hi! I'm unable to message in ${context.guild.name}'s #${channel.name} channel. Please double check the text channel's permissions.`,
        }
        await context.author.send({ embed });
        return;
    }
    return context.channel.send(messageContent);
}


export {
    EMBED_INFO_COLOR,
    EMBED_ERROR_COLOR,
    touch,
    getCommandFiles,
    sendSongMessage,
    getDebugContext,
    sendInfoMessage,
    sendErrorMessage,
    sendOptionsMessage,
    arraysEqual,
    bold,
    italicize,
    codeLine
}
