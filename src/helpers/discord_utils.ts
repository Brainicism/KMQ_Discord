import * as fs from "fs";
import * as path from "path";
import * as Discord from "discord.js";
import GuildPreference from "../models/guild_preference";
import GameSession from "../models/game_session";
import BaseCommand from "commands/base_command";
import _logger from "../logger";
import { getSongCount, GameOption } from "./game_utils";
import { Databases } from "types";
const logger = _logger("utils");
const EMBED_INFO_COLOR = 0x000000; // BLACK
const EMBED_ERROR_COLOR = 0xE74C3C; // RED

const sendSongMessage = async (message: Discord.Message, gameSession: GameSession, isForfeit: boolean) => {
    let footer = null;
    const gameRound = gameSession.gameRound;
    if (!gameRound) return;
    if (gameRound.songAliases.length > 0) {
        footer = {
            text: `Aliases: ${Array.from(gameRound.songAliases).join(", ")}`
        };
    }
    else {
        //occasionally show suggestions
        if (Math.random() <= 0.3) {
            footer = {
                text: "Have a suggestion for an alternate song name? Tell us on the support server!"
            }
        }
    }
    await sendMessage(message, {
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: isForfeit ? null : message.author.username,
                icon_url: isForfeit ? null : message.author.avatarURL
            },
            title: `"${gameRound.song}" - ${gameRound.artist}`,
            description: `https://youtube.com/watch?v=${gameRound.videoID}\n\n**Scoreboard**`,
            image: {
                url: `https://img.youtube.com/vi/${gameRound.videoID}/hqdefault.jpg`
            },
            fields: gameSession.scoreboard.getScoreboard(),
            footer
        }
    });
}
const sendInfoMessage = async (message: Discord.Message, title: string, description?: string, footerText?: string, footerImageWithPath?: string) => {
    const embed = new Discord.RichEmbed({
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
        const footerImage = path.basename(footerImageWithPath);
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

const sendOptionsMessage = async (message: Discord.Message, guildPreference: GuildPreference, db: Databases, updatedOption: string) => {
    let totalSongs = await getSongCount(guildPreference, db);
    let groupsMode = guildPreference.getGroupIds() !== null;
    let cutoffString = `between the years ${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`;


    let genderString = `${guildPreference.getSQLGender()} artists`;
    let groupsString = groupsMode ? `${guildPreference.getGroupNames().join(", ")}` : null;
    let limitString = `${Math.min(totalSongs, guildPreference.getLimit())}`;
    let volumeString = `${guildPreference.getVolume()}`;
    let seekTypeString = `${guildPreference.getSeekType()}`;
    let modeTypeString = `${guildPreference.getModeType()}`;

    cutoffString = updatedOption == GameOption.CUTOFF ? bold(cutoffString) : codeLine(cutoffString);
    genderString = updatedOption == GameOption.GENDER ? bold(genderString) : codeLine(genderString);
    limitString = updatedOption == GameOption.LIMIT ? bold(limitString) : codeLine(limitString);
    groupsString = updatedOption == GameOption.GROUPS ? bold(groupsString) : codeLine(groupsString);
    volumeString = updatedOption == GameOption.VOLUME ? bold(volumeString) : codeLine(volumeString);
    seekTypeString = updatedOption == GameOption.SEEK_TYPE ? bold(seekTypeString) : codeLine(seekTypeString);
    modeTypeString = updatedOption == GameOption.MODE_TYPE ? bold(modeTypeString) : codeLine(modeTypeString);

    await sendInfoMessage(message,
        updatedOption == null ? "Options" : `${updatedOption} updated`,
        `Now playing the ${limitString} out of the __${totalSongs}__ most popular songs by ${groupsMode ? groupsString : genderString} ${cutoffString}. \nPlaying from the ${seekTypeString} point of each song and at ${volumeString}% volume. Guess the ${modeTypeString}'s name!`,
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
            const command = await import(`../commands/${file}`);
            const commandName = file.split(".")[0];
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
        const currentTime = new Date();
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
    const voiceConnection = client.voiceConnections.get(message.guild.id);
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
    if (!message.member.voiceChannel || !message.guild.voiceConnection) {
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
    if (!context.guild.me.permissionsIn(context.channel).has("SEND_MESSAGES")) {
        logger.warn(`${getDebugContext(context)} | Missing SEND_MESSAGES permissions`);
        const embed = {
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
