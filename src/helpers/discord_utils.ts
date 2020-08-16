import * as fs from "fs";
import * as Eris from "eris";
import { client } from "../kmq";
import GuildPreference from "../models/guild_preference";
import GameSession from "../models/game_session";
import BaseCommand from "../commands/base_command";
import _logger from "../logger";
import { getSongCount, GameOption } from "./game_utils";
import { getFact } from "../fact_generator";
import { SendMessagePayload } from "../types";
const logger = _logger("utils");
export const EMBED_INFO_COLOR = 0x000000; // BLACK
export const EMBED_ERROR_COLOR = 0xE74C3C; // RED
export const EMBED_SUCCESS_COLOR = 0x00FF00; // GREEN
const MAX_EMBED_FIELDS = 25;

export async function sendSongMessage(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession, isForfeit: boolean, guesser?: string) {
    let footer: Eris.EmbedFooterOptions = null;
    const gameRound = gameSession.gameRound;
    if (!gameRound) return;
    if (gameRound.songAliases.length > 0) {
        footer = {
            text: `Aliases: ${Array.from(gameRound.songAliases).join(", ")}`
        };
    }
    else {
        if (Math.random() <= 0.3) {
            let fact: string;
            try {
                fact = await getFact();
            }
            catch (e) {
                logger.error(`${getDebugContext(message)} | Error retrieving fact. err = ${e}`);
                fact = null;
            }
            footer = {
                text: fact
            }
        }
    }
    let emptyScoreBoard = gameSession.scoreboard.isEmpty();
    let description = `${isForfeit ? "Nobody got it." : (`**${guesser}** guessed correctly!`)}\nhttps://youtube.com/watch?v=${gameRound.videoID} ${!emptyScoreBoard ? "\n\n**Scoreboard**" : ""}`
    await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: isForfeit ? EMBED_ERROR_COLOR : EMBED_SUCCESS_COLOR,
            author: {
                name: isForfeit ? null : message.author.username,
                icon_url: isForfeit ? null : message.author.avatarURL
            },
            title: `"${gameRound.song}" - ${gameRound.artist}`,
            description,
            image: {
                url: `https://img.youtube.com/vi/${gameRound.videoID}/hqdefault.jpg`
            },
            fields: gameSession.scoreboard.getScoreboard().slice(0, MAX_EMBED_FIELDS),
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
    let volumeString = `${guildPreference.getVolume()}`;
    let seekTypeString = `${guildPreference.getSeekType()}`;
    let modeTypeString = `${guildPreference.getModeType()}`;

    cutoffString = updatedOption == GameOption.CUTOFF ? bold(cutoffString) : codeLine(cutoffString);
    genderString = updatedOption == GameOption.GENDER ? bold(genderString) : codeLine(genderString);
    limitString = updatedOption == GameOption.LIMIT ? bold(limitString) : codeLine(limitString);
    if (groupsString && groupsString.length > 400) {
        groupsString = `${groupsString.substr(0, 400)} and many others...`;
    }
    groupsString = updatedOption == GameOption.GROUPS ? bold(groupsString) : codeLine(groupsString);
    volumeString = updatedOption == GameOption.VOLUME ? bold(volumeString) : codeLine(volumeString);
    seekTypeString = updatedOption == GameOption.SEEK_TYPE ? bold(seekTypeString) : codeLine(seekTypeString);
    modeTypeString = updatedOption == GameOption.MODE_TYPE ? bold(modeTypeString) : codeLine(modeTypeString);

    await sendInfoMessage(message,
        updatedOption == null ? "Options" : `${updatedOption} updated`,
        `Now playing the ${limitString} out of the __${totalSongs}__ most popular songs by ${groupsMode ? groupsString : genderString} ${cutoffString}. \nPlaying from the ${seekTypeString} point of each song and at ${volumeString}% volume. Guess the ${modeTypeString}'s name!`,
        updatedOption == null ? `Psst. Your bot prefix is \`${guildPreference.getBotPrefix()}\`.` : null,
        updatedOption == null ? "https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/src/assets/tsukasa.jpg" : null
    );
}

export async function sendEndGameMessage(messagePayload: SendMessagePayload, gameSession: GameSession) {
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
                fields: gameSession.scoreboard.getScoreboard().slice(0, MAX_EMBED_FIELDS)
            }
        });
    }
}

export async function sendScoreboardMessage(message: Eris.Message<Eris.GuildTextableChannel>, gameSession: GameSession) {
    await sendMessage({ channel: message.channel, authorId: message.author.id }, {
        embed: {
            color: EMBED_SUCCESS_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL
            },
            description: gameSession.scoreboard.isEmpty() ? "(╯°□°）╯︵ ┻━┻" : null,
            title: "**Scoreboard**",
            fields: gameSession.scoreboard.getScoreboard().slice(0, MAX_EMBED_FIELDS)
        }
    });
}

export function getDebugContext(message: Eris.Message): string {
    return `gid: ${message.guildID}, uid: ${message.author.id}`
}

export function getCommandFiles(): Promise<{ [commandName: string]: BaseCommand }> {
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

export function bold(text: string): string {
    return `**${text}**`;
}

export function italicize(text: string): string {
    return `*${text}*`;
}

export function codeLine(text: string): string {
    return `\`${text}\``
}

export function touch(filePath: string) {
    try {
        const currentTime = new Date();
        fs.utimesSync(filePath, currentTime, currentTime);
    } catch (err) {
        fs.closeSync(fs.openSync(filePath, "w"));
    }
}

export function arraysEqual(arr1: Array<any>, arr2: Array<any>): boolean {
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
    return getVoiceChannel(message).voiceMembers.size - 1;
}

export function getVoiceChannel(message: Eris.Message<Eris.GuildTextableChannel>): Eris.VoiceChannel {
    const voiceChannel = message.channel.guild.channels.get(message.member.voiceState.channelID) as Eris.VoiceChannel;
    return voiceChannel;
}

export function getVoiceConnection(message: Eris.Message): Eris.VoiceConnection {
    const voiceConnection = client.voiceConnections.get(message.guildID);
    return voiceConnection;
}


export async function sendMessage(messagePayload: SendMessagePayload, messageContent: Eris.MessageContent): Promise<Eris.Message> {
    const channel = messagePayload.channel;
    if (!channel.permissionsOf(client.user.id).has("sendMessages")) {
        logger.warn(`gid: ${channel.guild.id}, uid: ${messagePayload.authorId} | Missing SEND_MESSAGES permissions`);
        if (!messagePayload.authorId) return;
        const embed = {
            color: EMBED_INFO_COLOR,
            title: `Missing Permissions`,
            description: `Hi! I'm unable to message in ${channel.guild.name}'s #${channel.name} channel. Please double check the text channel's permissions.`,
        }
        const dmChannel = await client.getDMChannel(messagePayload.authorId);
        await client.createMessage(dmChannel.id, { embed });
        return;
    }
    return client.createMessage(channel.id, messageContent);
}
