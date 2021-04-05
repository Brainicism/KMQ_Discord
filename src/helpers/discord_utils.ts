import Eris, { EmbedOptions, TextableChannel } from "eris";
import EmbedPaginator from "eris-pagination";
import path from "path";
import GuildPreference from "../structures/guild_preference";
import GameSession from "../structures/game_session";
import _logger from "../logger";
import { endSession, getSongCount } from "./game_utils";
import { getFact } from "../fact_generator";
import { EmbedPayload, GameOption, GuildTextableMessage, PlayerRoundResult } from "../types";
import { chunkArray, codeLine, bold, parseJsonFile, chooseWeightedRandom, getOrdinalNum } from "./utils";
import state from "../kmq";
import { ModeType } from "../commands/game_options/mode";
import Scoreboard from "../structures/scoreboard";
import GameRound from "../structures/game_round";
import EliminationScoreboard from "../structures/elimination_scoreboard";
import TeamScoreboard from "../structures/team_scoreboard";
import { GameType } from "../commands/game_commands/play";
import { ArtistType } from "../commands/game_options/artisttype";
import { SubunitsPreference } from "../commands/game_options/subunits";
import { KmqImages } from "../constants";
import MessageContext from "../structures/message_context";
import { OstPreference } from "../commands/game_options/ost";
import { ReleaseType } from "../commands/game_options/release";
import KmqMember from "../structures/kmq_member";

const endGameMessages = parseJsonFile(path.resolve(__dirname, "../../data/end_game_messages.json"));

const logger = _logger("utils");
export const EMBED_INFO_COLOR = 0x000000; // BLACK
export const EMBED_ERROR_COLOR = 0xE74C3C; // RED
export const EMBED_SUCCESS_COLOR = 0x00FF00; // GREEN
const EMBED_FIELDS_PER_PAGE = 20;
const REQUIRED_TEXT_PERMISSIONS = ["addReactions" as const, "embedLinks" as const];
const REQUIRED_VOICE_PERMISSIONS = ["voiceConnect" as const, "voiceSpeak" as const];

/**
 * @param user - The User object
 * @returns the user's Discord tag
 */
export function getUserTag(user: Eris.User): string {
    return `${user.username}#${user.discriminator}`;
}

/**
 * @param messageContext - The Message or context of the Message that initiated the workflow
 * @returns a string containing basic debug information
 */
export function getDebugLogHeader(messageContext: MessageContext | Eris.Message): string {
    if (messageContext instanceof Eris.Message) {
        return `gid: ${messageContext.guildID}, uid: ${messageContext.author.id}`;
    }
    return `gid: ${messageContext.guildID}`;
}

/**
 * A lower level message sending utility
 * and when a Eris Message object isn't available in the context
 * @param textChannel - The channel where the message should be delivered
 * @param messageContent - The MessageContent to send
 */
async function sendMessage(textChannelID: string, messageContent: Eris.AdvancedMessageContent): Promise<Eris.Message> {
    const channel = state.client.getChannel(textChannelID) as Eris.TextChannel;

    // only reply to message if has required permissions
    if (!channel.permissionsOf(state.client.user.id).has("readMessageHistory")) {
        if (messageContent.messageReferenceID) {
            messageContent.messageReferenceID = null;
        }
    }

    try {
        return await state.client.createMessage(textChannelID, messageContent);
    } catch (e) {
        logger.error(`Error sending message. err = ${e}. body = ${JSON.stringify(messageContent)}`);
        return null;
    }
}

/**
 * Sends an error embed with the specified title/description
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param title - The title of the embed
 * @param description - The description of the embed
 */
export async function sendErrorMessage(messageContext: MessageContext, embedPayload: EmbedPayload): Promise<Eris.Message<TextableChannel>> {
    return sendMessage(messageContext.textChannelID, {
        embed: {
            color: embedPayload.color || EMBED_ERROR_COLOR,
            author: messageContext.author ? {
                name: messageContext.author.username,
                icon_url: messageContext.author.avatarUrl,
            } : null,
            title: bold(embedPayload.title),
            description: embedPayload.description,
            footer: embedPayload.footerText ? {
                text: embedPayload.footerText,
            } : null,
            thumbnail: embedPayload.thumbnailUrl ? { url: embedPayload.thumbnailUrl } : { url: KmqImages.DEAD },
        },
    });
}

/**
 * Sends an info embed with the specified title/description/footer text
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param title - The title of the embed
 * @param description - The description of the embed
 * @param footerText - The footer text of the embed
 */
export async function sendInfoMessage(messageContext: MessageContext, embedPayload: EmbedPayload, reply = false): Promise<Eris.Message<TextableChannel>> {
    if (embedPayload.description && embedPayload.description.length > 2048) {
        return sendErrorMessage(messageContext, { title: "Error", description: "Response message was too long, report this error to the KMQ help server" });
    }

    const author = messageContext.author || embedPayload.author;
    const embed: EmbedOptions = {
        color: embedPayload.color || EMBED_INFO_COLOR,
        author: author ? {
            name: author.username,
            icon_url: author.avatarUrl,
        } : null,
        title: bold(embedPayload.title),
        description: embedPayload.description,
        fields: embedPayload.fields,
        footer: embedPayload.footerText ? {
            text: embedPayload.footerText,
        } : null,
        thumbnail: embedPayload.thumbnailUrl ? { url: embedPayload.thumbnailUrl } : null,
        timestamp: embedPayload.timestamp,
    };
    return sendMessage(messageContext.textChannelID, { embed, messageReferenceID: reply ? messageContext.referencedMessageID : null });
}

/**
 * Sends an end of GameRound message displaying the correct answer as well as
 * other game related information
 * @param messageContext - An object to pass along relevant parts of Eris.Message
 * @param scoreboard - The GameSession's corresponding Scoreboard
 * @param gameRound - The GameSession's corresponding GameRound
 * @param songGuessed - Whether the song was guessed
 */
export async function sendEndOfRoundMessage(messageContext: MessageContext, scoreboard: Scoreboard, gameRound: GameRound, playerRoundResults: Array<PlayerRoundResult>, timeRemaining?: number) {
    const footer: Eris.EmbedFooterOptions = {
        text: "",
    };

    if (gameRound.acceptedSongAnswers.length > 1) {
        footer.text += `Aliases: ${Array.from(gameRound.acceptedSongAnswers).join(", ")}\n`;
    }

    if (timeRemaining) {
        footer.text += timeRemaining > 0 ? `⏰ ${Math.ceil(timeRemaining)} minute(s) remaining` : "⏰ Time's up!";
    }

    const fact = Math.random() <= 0.05 ? getFact() : null;

    const emptyScoreBoard = scoreboard.isEmpty();
    const correctGuess = playerRoundResults.length > 0;
    let correctDescription = "";
    if (correctGuess) {
        correctDescription += (`**${playerRoundResults[0].player.tag}** ${playerRoundResults[0].streak >= 5 ? `(🔥 ${playerRoundResults[0].streak})` : ""} guessed correctly  (+${playerRoundResults[0].expGain} xp)`);
        if (playerRoundResults.length > 1) {
            const runnerUps = playerRoundResults.slice(1);
            let runnerUpsDescription = runnerUps
                .map((x) => `${x.player.tag} (+${x.expGain} xp)`)
                .slice(0, 10)
                .join("\n");
            if (runnerUps.length >= 10) {
                runnerUpsDescription += "\nand many others...";
            }
            correctDescription += `\n\n**Runner Ups**\n${runnerUpsDescription}`;
        }
    }
    const description = `${correctGuess ? correctDescription : "Nobody got it."}\nhttps://youtu.be/${gameRound.videoID} ${!emptyScoreBoard ? "\n\n**Scoreboard**" : ""}`;
    const fields = scoreboard.getScoreboardEmbedFields().slice(0, 10);
    if (fact) {
        fields.push({
            name: "__Did you know?__", value: fact, inline: false,
        });
    }

    await sendInfoMessage(messageContext, {
        color: correctGuess ? EMBED_SUCCESS_COLOR : EMBED_ERROR_COLOR,
        author: {
            avatarUrl: messageContext.author.avatarUrl,
            username: messageContext.author.username,
        },
        title: `"${gameRound.songName}" (${gameRound.songYear}) - ${gameRound.artist}`,
        description,
        thumbnailUrl: `https://img.youtube.com/vi/${gameRound.videoID}/hqdefault.jpg`,
        fields,
        footerText: footer ? footer.text : "",
    }, correctGuess);
}

/**
 * Sends an embed displaying the currently selected GameOptions
 * @param message - The Message object
 * @param guildPreference - The corresponding GuildPreference
 * @param updatedOption - Specifies which GameOption was modified
 * @param footerText - The footer text
 */
export async function sendOptionsMessage(messageContext: MessageContext, guildPreference: GuildPreference,
    updatedOption?: { option: GameOption, reset: boolean }, footerText?: string) {
    const totalSongs = await getSongCount(guildPreference);
    if (totalSongs === null) {
        sendErrorMessage(messageContext, { title: "Error retrieving song data", description: `Try again in a bit, or report this error to the official KMQ server found in \`${process.env.BOT_PREFIX}help\`.` });
        return;
    }

    const { gameSessions } = state;
    const isEliminationMode = gameSessions[messageContext.guildID] && gameSessions[messageContext.guildID].gameType === GameType.ELIMINATION;

    const goalMode = guildPreference.isGoalSet() && !isEliminationMode;
    const guessTimeoutMode = guildPreference.isGuessTimeoutSet();
    const shuffleUniqueMode = guildPreference.isShuffleUnique();
    const visibleLimitEnd = Math.min(totalSongs.countBeforeLimit, guildPreference.getLimitEnd());
    const visibleLimitStart = Math.min(totalSongs.countBeforeLimit, guildPreference.getLimitStart());
    const optionStrings = {};
    optionStrings[GameOption.CUTOFF] = `between the years ${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`;
    optionStrings[GameOption.GENDER] = guildPreference.isGenderAlternating() ? "alternating gender" : `${guildPreference.getGender().join(", ")}`;
    optionStrings[GameOption.ARTIST_TYPE] = `${guildPreference.getArtistType() === ArtistType.BOTH ? "artists" : guildPreference.getArtistType()}`;
    optionStrings[GameOption.GROUPS] = guildPreference.isGroupsMode() ? `${guildPreference.getDisplayedGroupNames()}` : null;
    optionStrings[GameOption.EXCLUDE] = guildPreference.isExcludesMode() ? `${guildPreference.getDisplayedExcludesGroupNames()}` : null;
    optionStrings[GameOption.INCLUDE] = guildPreference.isIncludesMode() ? `${guildPreference.getDisplayedIncludesGroupNames()}` : null;
    optionStrings[GameOption.LIMIT] = guildPreference.getLimitStart() === 0 ? `${visibleLimitEnd}` : `${getOrdinalNum(visibleLimitStart)} to ${getOrdinalNum(visibleLimitEnd)} (${totalSongs.count} songs)`;
    optionStrings[GameOption.SEEK_TYPE] = `${guildPreference.getSeekType()}`;
    optionStrings[GameOption.MODE_TYPE] = `${guildPreference.getModeType() === ModeType.BOTH ? "song or artist" : guildPreference.getModeType()}`;
    optionStrings[GameOption.GOAL] = `${guildPreference.getGoal()}`;
    optionStrings[GameOption.TIMER] = `${guildPreference.getGuessTimeout()}`;
    optionStrings[GameOption.SHUFFLE_TYPE] = `${guildPreference.getShuffleType()}`;
    optionStrings[GameOption.SUBUNIT_PREFERENCE] = `${guildPreference.getSubunitPreference() === SubunitsPreference.INCLUDE ? "including" : "excluding"} subunits`;
    const ostPreferenceDisplayStrings = {
        [OstPreference.INCLUDE]: "Including",
        [OstPreference.EXCLUDE]: "Excluding",
        [OstPreference.EXCLUSIVE]: "Exclusively including",
    };
    optionStrings[GameOption.OST_PREFERENCE] = `${ostPreferenceDisplayStrings[guildPreference.getOstPreference()]}`;
    optionStrings[GameOption.RELEASE_TYPE] = `${guildPreference.getReleaseType() === ReleaseType.OFFICIAL ? "only official song releases" : "all songs including dance practices, acoustic versions, remixes, etc"}`;

    for (const gameOption of Object.keys(optionStrings)) {
        const gameOptionString = optionStrings[gameOption];
        optionStrings[gameOption] = (updatedOption && updatedOption.option) === gameOption ? bold(gameOptionString) : codeLine(gameOptionString);
    }

    const goalMessage = `First one to ${optionStrings[GameOption.GOAL]} points wins.`;
    const guessTimeoutMessage = ` in less than ${optionStrings[GameOption.TIMER]} seconds`;
    const shuffleMessage = `Songs will be shuffled in ${optionStrings[GameOption.SHUFFLE_TYPE]} order. `;

    if (updatedOption && updatedOption.reset) {
        footerText = `Looking for information on how to use this command? Check out '${process.env.BOT_PREFIX}help [command]' to learn more`;
    }

    await sendInfoMessage(messageContext,
        {
            title: updatedOption === null ? "Options" : `${updatedOption.option} ${updatedOption.reset ? "reset" : "updated"}`,
            description:
                `Now playing the ${optionStrings[GameOption.LIMIT]} most popular songs out of the __${totalSongs.countBeforeLimit}__ by ${guildPreference.isGroupsMode() ? `${optionStrings[GameOption.GROUPS]} (${optionStrings[GameOption.SUBUNIT_PREFERENCE]})` : `${optionStrings[GameOption.GENDER]} ${optionStrings[GameOption.ARTIST_TYPE]}`}\
                ${guildPreference.isGroupsMode() && guildPreference.isGenderAlternating() && guildPreference.getGroupIDs().length > 1 ? ` with ${optionStrings[GameOption.GENDER]}` : ""} ${optionStrings[GameOption.CUTOFF]}\
                ${guildPreference.isExcludesMode() && !guildPreference.isGroupsMode() ? `, excluding ${optionStrings[GameOption.EXCLUDE]}` : ""}${guildPreference.isIncludesMode() && !guildPreference.isGroupsMode() ? `, including ${optionStrings[GameOption.INCLUDE]}` : ""}. \nPlaying from the ${optionStrings[GameOption.SEEK_TYPE]} point of each song. ${shuffleUniqueMode ? shuffleMessage : ""}\
                Guess the ${optionStrings[GameOption.MODE_TYPE]}'s name${guessTimeoutMode ? guessTimeoutMessage : ""}! ${goalMode ? goalMessage : ""}\
                \nPlaying \`${guildPreference.getLanguageType()}\` language songs.\
                ${guildPreference.isDurationSet() ? `\nThe game will automatically end after \`${guildPreference.getDuration()}\` minutes from the time the game starts.` : ""}\
                \n${optionStrings[GameOption.OST_PREFERENCE]} OST songs.\
                \nPlaying ${optionStrings[GameOption.RELEASE_TYPE]}.`,
            footerText: footerText !== null ? footerText : null,
            thumbnailUrl: KmqImages.LISTENING,
        });
}

/**
 * Sends an embed displaying the winner of the session as well as the scoreboard
 * @param textChannel - The channel where the message should be delivered
 * @param gameSession - The GameSession that has ended
 */
export async function sendEndGameMessage(textChannelID: string, gameSession: GameSession) {
    const { client } = state;
    const footerText = `${gameSession.getCorrectGuesses()}/${gameSession.getRoundsPlayed()} songs correctly guessed!`;
    if (gameSession.scoreboard.isEmpty()) {
        await sendInfoMessage(new MessageContext(textChannelID), {
            color: EMBED_INFO_COLOR,
            author: {
                username: client.user.username,
                avatarUrl: client.user.avatarURL,
            },
            title: "Nobody won",
            footerText,
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
        });
    } else {
        const winners = gameSession.scoreboard.getWinners();
        const embedFields = gameSession.scoreboard.getScoreboardEmbedFields().slice(0, 10);
        const endGameMessage = Math.random() < 0.5 ? chooseWeightedRandom(endGameMessages.kmq) : chooseWeightedRandom(endGameMessages.game);
        embedFields.push(
            {
                name: endGameMessage.title,
                value: endGameMessage.message,
                inline: false,
            },
        );
        await sendInfoMessage(new MessageContext(textChannelID), {
            color: EMBED_SUCCESS_COLOR,
            description: "**Scoreboard**",
            thumbnailUrl: winners[0].getAvatarURL(),
            title: `🎉 ${gameSession.scoreboard.getWinnerMessage()} 🎉`,
            fields: embedFields,
            footerText,
        });
    }
}

/**
 * Sends a paginated embed
 * @param message - The Message object
 * @param embeds - A list of embeds to paginate over
 */
export async function sendPaginationedEmbed(message: GuildTextableMessage, embeds: Array<Eris.EmbedOptions>) {
    if (embeds.length > 1) {
        return EmbedPaginator.createPaginationEmbed(message, embeds, { timeout: 60000 });
    }
    return sendMessage(message.channel.id, { embed: embeds[0] });
}

/**
 * Sends an embed displaying the scoreboard of the GameSession
 * @param message - The Message object
 * @param gameSession - The GameSession
 */
export async function sendScoreboardMessage(message: GuildTextableMessage, gameSession: GameSession) {
    if (gameSession.scoreboard.isEmpty() && gameSession.gameType !== GameType.ELIMINATION) {
        return sendInfoMessage(MessageContext.fromMessage(message), {
            color: EMBED_SUCCESS_COLOR,
            author: {
                username: message.author.username,
                avatarUrl: message.author.avatarURL,
            },
            description: "(╯°□°）╯︵ ┻━┻",
            title: "**Scoreboard**",
        });
    }
    const winnersFieldSubsets = chunkArray(gameSession.scoreboard.getScoreboardEmbedFields(), EMBED_FIELDS_PER_PAGE);
    let footerText = `Your score is ${gameSession.scoreboard.getPlayerScore(message.author.id)}.`;
    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard = gameSession.scoreboard as EliminationScoreboard;
        footerText = `You have ${eliminationScoreboard.getPlayerLives(message.author.id)} lives.`;
    } else if (gameSession.gameType === GameType.TEAMS) {
        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        footerText = `Your team's score: ${teamScoreboard.getTeamOfPlayer(message.author.id).getScore()}\nYour score: ${teamScoreboard.getPlayerScore(message.author.id)}`;
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

/**
 * Disconnects the bot from the voice channel of the  message's originating guild
 * @param message - The Message object
 */
export function disconnectVoiceConnection(message: GuildTextableMessage) {
    state.client.closeVoiceConnection(message.guildID);
}

/**
 * @param message - The Message object
 * @returns the bot's voice connection in the message's originating guild
 */
export function getVoiceConnection(message: Eris.Message): Eris.VoiceConnection {
    const voiceConnection = state.client.voiceConnections.get(message.guildID);
    return voiceConnection;
}

/**
 * @param message - The Message
 * @returns whether the message's author and the bot are in the same voice channel
 */
export function areUserAndBotInSameVoiceChannel(message: Eris.Message): boolean {
    const botVoiceConnection = getVoiceConnection(message);
    if (!message.member.voiceState || !botVoiceConnection) {
        return false;
    }
    return message.member.voiceState.channelID === botVoiceConnection.channelID;
}

/**
 * @param message - The Message object
 * @returns the voice channel that the message's author is in
 */
export function getVoiceChannelFromMessage(message: GuildTextableMessage): Eris.VoiceChannel {
    const voiceChannel = (message.channel as Eris.TextChannel).guild.channels.get(message.member.voiceState.channelID) as Eris.VoiceChannel;
    return voiceChannel;
}

/**
 * @param message - The Message object
 * @returns the voice channel that the message's author is in
 */
export function getVoiceChannel(voiceChannelID: string): Eris.VoiceChannel {
    const voiceChannel = state.client.getChannel(voiceChannelID) as Eris.VoiceChannel;
    return voiceChannel;
}

/**
 * @param message - The Message object
 * @returns the number of persons in the voice channel excluding bots
 */
export function getNumParticipants(voiceChannelID: string): number {
    return (getVoiceChannel(voiceChannelID).voiceMembers.filter((x) => !x.bot)).length;
}

/**
 * @param missingPermissions - List of missing text permissions
 * @returns a friendly string describing the missing text permissions
 */
function missingPermissionsText(missingPermissions: string[]): string {
    return `Ensure that the bot has the following permissions: \`${missingPermissions.join(", ")}\`\n\nSee the following link for details: https://support.discord.com/hc/en-us/articles/206029707-How-do-I-set-up-Permissions-. If you are still having issues, join the official KMQ server found in \`${process.env.BOT_PREFIX}help\``;
}

/**
 * @param message - The Message object
 * @returns whether the bot has permissions to join the message author's currently active voice channel
 */
export function voicePermissionsCheck(message: GuildTextableMessage): boolean {
    const voiceChannel = getVoiceChannelFromMessage(message);
    const messageContext = MessageContext.fromMessage(message);
    const missingPermissions = REQUIRED_VOICE_PERMISSIONS.filter((permission) => !voiceChannel.permissionsOf(state.client.user.id).has(permission));
    if (missingPermissions.length > 0) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Missing [${missingPermissions.join(", ")}] permissions`);
        sendErrorMessage(MessageContext.fromMessage(message), { title: "Missing Permissions", description: missingPermissionsText(missingPermissions) });
        return false;
    }
    const channelFull = voiceChannel.userLimit && (voiceChannel.voiceMembers.size >= voiceChannel.userLimit);
    if (channelFull) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Channel full`);
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Voice Channel Full", description: "Ensure that there's enough room in the voice channel for me to join" });
        return false;
    }
    const afkChannel = voiceChannel.id === voiceChannel.guild.afkChannelID;
    if (afkChannel) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Attempted to start game in AFK voice channel`);
        sendInfoMessage(MessageContext.fromMessage(message), { title: "AFK Voice Channel", description: "Ensure you're not in the inactive voice channel so that you can hear me!" });
        return false;
    }
    return true;
}

/**
 * @param message - The Message object
 * @returns whether the bot has permissions to message's originating text channel
 */
export async function textPermissionsCheck(message: GuildTextableMessage, channel: Eris.TextChannel): Promise<boolean> {
    const { client } = state;
    const messageContext = MessageContext.fromMessage(message);
    if (!channel.permissionsOf(client.user.id).has("sendMessages")) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Missing SEND_MESSAGES permissions`);
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
        logger.warn(`${getDebugLogHeader(messageContext)} | Missing [${missingPermissions.join(", ")}] permissions`);
        client.createMessage(channel.id, {
            content: missingPermissionsText(missingPermissions),
        });
        return false;
    }
    return true;
}

/**
 * @param gameSession - The currently active GameSession
 * @param channel - The voice channel the bot could be in
 * @returns whether the bot is alone 😔 ends the gameSession if it does
 */
export function checkBotIsAlone(gameSession: GameSession, channel: Eris.VoiceChannel): boolean {
    if (channel.voiceMembers.size === 1 && channel.voiceMembers.has(state.client.user.id)) {
        if (gameSession) {
            logger.info(`gid: ${channel.guild.id} | Bot is only user left, leaving voice...`);
            endSession(gameSession);
        }
        return true;
    }
    return false;
}

/** @returns the debug TextChannel */
export function getDebugChannel(): Eris.TextChannel {
    if (!process.env.DEBUG_SERVER_ID || !process.env.DEBUG_TEXT_CHANNEL_ID) return null;
    return <Eris.TextChannel>state.client.guilds.get(process.env.DEBUG_SERVER_ID)
        .channels.get(process.env.DEBUG_TEXT_CHANNEL_ID);
}

/**
 * @param timeInMs - A date in epoch milliseconds
 * @returns a SQL ISO-friendly timestamp
 */
export function getSqlDateString(timeInMs?: number): string {
    if (timeInMs) {
        return new Date(timeInMs).toISOString().slice(0, 19).replace("T", " ");
    }
    return new Date().toISOString().slice(0, 19).replace("T", " ");
}
