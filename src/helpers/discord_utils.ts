/* eslint-disable @typescript-eslint/no-use-before-define */
import Eris from "eris";
import EmbedPaginator from "eris-pagination";
import axios from "axios";
import GuildPreference from "../structures/guild_preference";
import GameSession from "../structures/game_session";
import { IPCLogger } from "../logger";
import {
    getAvailableSongCount,
    getKmqCurrentVersion,
    userBonusIsActive,
    getLocalizedSongName,
    getLocalizedArtistName,
} from "./game_utils";
import { getFact } from "../fact_generator";
import {
    EmbedPayload,
    GameOption,
    GameOptionCommand,
    PriorityGameOption,
    ConflictingGameOptions,
    GuildTextableMessage,
    PlayerRoundResult,
    GameInfoMessage,
    GameType,
    QueriedSong,
} from "../types";
import {
    chunkArray,
    codeLine,
    bold,
    underline,
    italicize,
    strikethrough,
    chooseWeightedRandom,
    getOrdinalNum,
    friendlyFormattedNumber,
    delay,
    standardDateFormat,
} from "./utils";
import { state } from "../kmq_worker";
import Scoreboard from "../structures/scoreboard";
import GameRound from "../structures/game_round";
import dbContext from "../database_context";
import EliminationScoreboard from "../structures/elimination_scoreboard";
import TeamScoreboard from "../structures/team_scoreboard";
import { KmqImages } from "../constants";
import MessageContext from "../structures/message_context";
import { GuessModeType } from "../commands/game_options/guessmode";
import { REVIEW_LINK, VOTE_LINK } from "../commands/game_commands/vote";
import { UniqueSongCounter } from "../structures/song_selector";
import { LocaleType, DEFAULT_LOCALE } from "./localization_manager";

const logger = new IPCLogger("utils");
export const EMBED_ERROR_COLOR = 0xed4245; // Red
export const EMBED_SUCCESS_COLOR = 0x57f287; // Green
export const EMBED_SUCCESS_BONUS_COLOR = 0xfee75c; // Gold
const EMBED_FIELDS_PER_PAGE = 20;
const REQUIRED_TEXT_PERMISSIONS = [
    "addReactions" as const,
    "embedLinks" as const,
];

const REQUIRED_VOICE_PERMISSIONS = [
    "viewChannel" as const,
    "voiceConnect" as const,
    "voiceSpeak" as const,
];

const SCOREBOARD_FIELD_CUTOFF = 6;
const MAX_SCOREBOARD_PLAYERS = 30;
const MAX_RUNNERS_UP = 30;
const MAX_INTERACTION_RESPONSE_TIME = 3 * 1000;

export type EmbedGenerator = () => Promise<Eris.EmbedOptions>;

/**
 * @param user - The user (must be some object with username and discriminator fields)
 * @returns the user's Discord tag
 */
export function getUserTag(user: {
    username: string;
    discriminator: string;
}): string {
    return `${user.username}#${user.discriminator}`;
}

/**
 * @param userID - The user ID
 * @returns a clickable mention to user
 */
export function getMention(userID: string): string {
    return `<@${userID}>`;
}

/**
 * @param context - The object that initiated the workflow
 * @returns a string containing basic debug information
 */
export function getDebugLogHeader(
    context:
        | MessageContext
        | Eris.Message
        | Eris.ComponentInteraction
        | Eris.CommandInteraction
): string {
    if (context instanceof Eris.Message) {
        return `gid: ${context.guildID}, uid: ${context.author.id}, tid: ${context.channel.id}`;
    }

    if (
        context instanceof Eris.ComponentInteraction ||
        context instanceof Eris.CommandInteraction
    ) {
        return `gid: ${context.guildID}, uid: ${context.member?.id}, tid: ${context.channel.id}`;
    }

    return `gid: ${context.guildID}, tid: ${context.textChannelID}`;
}

/**
 * @param guildID - The guild ID
 * @param missingPermissions - List of missing text permissions
 * @returns a friendly string describing the missing text permissions
 */
function missingPermissionsText(
    guildID: string,
    missingPermissions: string[]
): string {
    return state.localizer.translate(
        guildID,
        "misc.failure.missingPermissionsText",
        {
            missingPermissions: missingPermissions.join(", "),
            permissionsLink:
                "https://support.discord.com/hc/en-us/articles/206029707-How-do-I-set-up-Permissions-",
            helpCommand: `\`${process.env.BOT_PREFIX}help\``,
        }
    );
}

/**
 * Fetches Users from cache, IPC, or via REST and update cache
 * @param userID - the user's ID
 * @param silentErrors - whether to log errors
 * @returns an instance of the User
 */
export async function fetchUser(
    userID: string,
    silentErrors = false
): Promise<Eris.User> {
    let user: Eris.User = null;
    const { client, ipc } = state;

    // fetch via cache
    user = client.users.get(userID);

    // fetch via IPC from other clusters
    if (!user) {
        user = await ipc.fetchUser(userID);
        if (user) {
            logger.debug(`User not in cache, fetched via IPC: ${userID}`);
        }
    }

    // fetch via REST
    if (!user) {
        try {
            user = await client.getRESTUser(userID);
            logger.debug(`User not in cache, fetched via REST: ${userID}`);
        } catch (err) {
            if (!silentErrors)
                logger.warn(
                    `Could not fetch user: ${userID}. err: ${err.code}. msg: ${err.message}`
                );
            return null;
        }
    }

    if (!user) {
        if (!silentErrors) logger.warn(`Could not fetch user: ${userID}`);
        return null;
    }

    // update cache
    client.users.update(user);
    return user;
}

/**
 * Fetches TextChannel from cache, IPC, or via REST and update cache
 * @param textChannelID - the text channel's ID
 * @returns an instance of the TextChannel
 */
async function fetchChannel(textChannelID: string): Promise<Eris.TextChannel> {
    let channel: Eris.TextChannel = null;
    const { client, ipc } = state;

    // fetch via cache
    channel = client.getChannel(textChannelID) as Eris.TextChannel;

    // fetch via IPC from other clusters
    if (!channel) {
        logger.debug(
            `Text channel not in cache, attempting to fetch via IPC: ${textChannelID}`
        );
        channel = await ipc.fetchChannel(textChannelID);
    }

    // fetch via REST
    if (!channel) {
        try {
            channel = (await client.getRESTChannel(
                textChannelID
            )) as Eris.TextChannel;

            logger.debug(
                `Text channel not in cache, fetched via REST: ${textChannelID}`
            );
        } catch (err) {
            logger.warn(
                `Could not fetch text channel: ${textChannelID}. err: ${err.code}. msg: ${err.message}`
            );
            return null;
        }
    }

    if (!channel) {
        logger.warn(`Could not fetch channel: ${textChannelID}`);
        return null;
    }

    // update cache
    if (channel.guild) {
        const guild = client.guilds.get(channel.guild.id);
        if (guild) {
            guild.channels.update(channel);
            client.channelGuildMap[channel.id] = guild.id;
        }
    }

    return channel;
}

/**
 * @param textChannelID - the text channel's ID
 * @param guildID - the guild's ID
 * @param authorID - the sender's ID
 * @returns whether the bot has permissions to message's originating text channel
 */
export async function textPermissionsCheck(
    textChannelID: string,
    guildID: string,
    authorID: string
): Promise<boolean> {
    const messageContext = new MessageContext(textChannelID, null, guildID);
    const channel = await fetchChannel(textChannelID);
    if (!channel) return false;
    if (!channel.permissionsOf(process.env.BOT_CLIENT_ID).has("sendMessages")) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext
            )} | Missing SEND_MESSAGES permissions`
        );
        const embed = {
            title: state.localizer.translate(
                guildID,
                "misc.failure.missingPermissions.title"
            ),
            description: state.localizer.translate(
                guildID,
                "misc.failure.missingPermissions.description",
                { channelName: `#${channel.name}` }
            ),
        };

        await sendDmMessage(authorID, { embeds: [embed] });
        return false;
    }

    const missingPermissions = REQUIRED_TEXT_PERMISSIONS.filter(
        (permission) =>
            !channel.permissionsOf(process.env.BOT_CLIENT_ID).has(permission)
    );

    if (missingPermissions.length > 0) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext
            )} | Missing Text Channel [${missingPermissions.join(
                ", "
            )}] permissions`
        );

        sendMessage(channel.id, {
            content: missingPermissionsText(guildID, missingPermissions),
        });
        return false;
    }

    return true;
}

async function sendMessageExceptionHandler(
    e: any,
    channelID: string,
    guildID: string,
    authorID: string,
    messageContent: Eris.AdvancedMessageContent
): Promise<void> {
    if (typeof e === "string") {
        if (e.startsWith("Request timed out")) {
            // Request Timeout
            logger.error(
                `Error sending message. Request timed out. textChannelID = ${channelID}.`
            );
        }
    } else if (e.code) {
        const errCode = e.code;
        switch (errCode) {
            case 500: {
                // Internal Server Error
                logger.error(
                    `Error sending message. 500 Internal Server Error. textChannelID = ${channelID}.`
                );
                break;
            }

            case 50035: {
                // Invalid Form Body
                logger.error(
                    `Error sending message. Invalid form body. textChannelID = ${channelID}. msg_content = ${JSON.stringify(
                        messageContent
                    )}`
                );
                break;
            }

            case 50001: {
                // Missing Access
                logger.warn(
                    `Error sending message. Missing Access. textChannelID = ${channelID}`
                );
                break;
            }

            case 50013: {
                // Missing Permissions
                logger.warn(
                    `Error sending message. Missing text permissions. textChannelID = ${channelID}.`
                );
                await textPermissionsCheck(channelID, guildID, authorID);
                break;
            }

            case 10003: {
                // Unknown channel
                logger.error(
                    `Error sending message. Unknown channel. textChannelID = ${channelID}.`
                );
                break;
            }

            case 50007: {
                // Cannot send messages to this user
                logger.warn(
                    `Error sending message. Cannot send messages to this user. userID = ${channelID}.`
                );
                break;
            }

            default: {
                // Unknown error code
                logger.error(
                    `Error sending message. Unknown error code ${errCode}. textChannelID = ${channelID}. msg = ${e.message}.`
                );
                break;
            }
        }
    } else {
        logger.error(
            `Error sending message. Unknown error. textChannelID = ${channelID}. err = ${JSON.stringify(
                e
            )}.body = ${JSON.stringify(messageContent)}`
        );
    }
}

/**
 * A lower level message sending utility
 * and when a Eris Message object isn't available in the context
 * @param textChannelID - The channel ID where the message should be delivered
 * @param messageContent - The MessageContent to send
 * @param file - The file to send
 * @param authorID - The author's ID
 */
export async function sendMessage(
    textChannelID: string,
    messageContent: Eris.AdvancedMessageContent,
    file?: Eris.FileContent,
    authorID?: string
): Promise<Eris.Message> {
    const channel = await fetchChannel(textChannelID);

    // only reply to message if has required permissions
    if (
        channel &&
        !channel
            .permissionsOf(process.env.BOT_CLIENT_ID)
            .has("readMessageHistory")
    ) {
        if (messageContent.messageReference) {
            messageContent.messageReference = null;
        }
    }

    try {
        return await state.client.createMessage(
            textChannelID,
            messageContent,
            file
        );
    } catch (e) {
        if (!channel) {
            logger.error(
                `Error sending message, and channel not cached. textChannelID = ${textChannelID}`
            );
        } else {
            await sendMessageExceptionHandler(
                e,
                channel.id,
                channel.guild.id,
                authorID,
                messageContent
            );
        }

        return null;
    }
}

/**
 * Sends a message to a user's DM channel
 * @param userID - the user's ID
 * @param messageContent - the message content
 */
async function sendDmMessage(
    userID: string,
    messageContent: Eris.AdvancedMessageContent
): Promise<Eris.Message> {
    const { client } = state;
    let dmChannel;
    try {
        dmChannel = await client.getDMChannel(userID);
    } catch (e) {
        logger.error(
            `Error sending message. Could not get DM channel. userID = ${userID}`
        );
        return null;
    }

    try {
        return await client.createMessage(dmChannel.id, messageContent);
    } catch (e) {
        await sendMessageExceptionHandler(
            e,
            dmChannel.id,
            null,
            userID,
            messageContent
        );
        return null;
    }
}

/**
 * Sends an error embed with the specified title/description
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - The embed payload
 */
export async function sendErrorMessage(
    messageContext: MessageContext,
    embedPayload: EmbedPayload
): Promise<Eris.Message<Eris.TextableChannel>> {
    const author =
        embedPayload.author == null || embedPayload.author
            ? embedPayload.author
            : messageContext.author;

    return sendMessage(
        messageContext.textChannelID,
        {
            embeds: [
                {
                    color: embedPayload.color || EMBED_ERROR_COLOR,
                    author: author
                        ? {
                              name: author.username,
                              icon_url: author.avatarUrl,
                          }
                        : null,
                    title: bold(embedPayload.title),
                    description: embedPayload.description,
                    footer: embedPayload.footerText
                        ? {
                              text: embedPayload.footerText,
                          }
                        : null,
                    thumbnail: embedPayload.thumbnailUrl
                        ? { url: embedPayload.thumbnailUrl }
                        : { url: KmqImages.DEAD },
                },
            ],
            components: embedPayload.components,
        },
        null,
        messageContext.author.id
    );
}

/**
 * Sends an info embed with the specified title/description/footer text
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - What to include in the message
 * @param reply - Whether to reply to the given message
 * @param boldTitle - Whether to bold the title
 * @param content - Plain text content
 */
export async function sendInfoMessage(
    messageContext: MessageContext,
    embedPayload: EmbedPayload,
    reply = false,
    boldTitle = true,
    content?: string
): Promise<Eris.Message<Eris.TextableChannel>> {
    if (embedPayload.description && embedPayload.description.length > 2048) {
        return sendErrorMessage(messageContext, {
            title: state.localizer.translate(
                messageContext.guildID,
                "misc.failure.error"
            ),
            description: state.localizer.translate(
                messageContext.guildID,
                "misc.failure.messageTooLong"
            ),
        });
    }

    const author =
        embedPayload.author == null || embedPayload.author
            ? embedPayload.author
            : messageContext.author;

    const embed: Eris.EmbedOptions = {
        color: embedPayload.color,
        author: author
            ? {
                  name: author.username,
                  icon_url: author.avatarUrl,
              }
            : null,
        title: boldTitle ? bold(embedPayload.title) : embedPayload.title,
        url: embedPayload.url,
        description: embedPayload.description,
        fields: embedPayload.fields,
        footer: embedPayload.footerText
            ? {
                  text: embedPayload.footerText,
              }
            : null,
        thumbnail: embedPayload.thumbnailUrl
            ? { url: embedPayload.thumbnailUrl }
            : null,
        timestamp: embedPayload.timestamp,
    };

    return sendMessage(
        messageContext.textChannelID,
        {
            embeds: [embed],
            messageReference:
                reply && messageContext.referencedMessageID
                    ? {
                          messageID: messageContext.referencedMessageID,
                          failIfNotExists: false,
                      }
                    : null,
            components: embedPayload.components,
            content,
        },
        null,
        messageContext.author.id
    );
}

/**
 * Sends an end of GameRound message displaying the correct answer as well as
 * other game related information
 * @param messageContext - An object to pass along relevant parts of Eris.Message
 * @param scoreboard - The GameSession's corresponding Scoreboard
 * @param gameRound - The GameSession's corresponding GameRound
 * @param guessModeType - The type of guess mode
 * @param playerRoundResults - The player round results
 * @param isMultipleChoiceMode  - Whether the game is in multiple choice mode
 * @param timeRemaining - The time remaining for the duration option
 * @param uniqueSongCounter - The unique song counter
 */
export async function sendEndRoundMessage(
    messageContext: MessageContext,
    scoreboard: Scoreboard,
    gameRound: GameRound,
    guessModeType: GuessModeType,
    playerRoundResults: Array<PlayerRoundResult>,
    isMultipleChoiceMode: boolean,
    timeRemaining?: number,
    uniqueSongCounter?: UniqueSongCounter
): Promise<Eris.Message<Eris.TextableChannel>> {
    const footer: Eris.EmbedFooterOptions = {
        text: "",
    };

    const aliasesText = state.localizer.translate(
        messageContext.guildID,
        "misc.inGame.aliases"
    );

    const locale = getGuildLocale(messageContext.guildID);
    const aliases: Array<string> = [];
    if (guessModeType === GuessModeType.ARTIST) {
        if (gameRound.song.hangulArtistName) {
            if (locale === LocaleType.KO) {
                aliases.push(gameRound.song.artistName);
            } else {
                aliases.push(gameRound.song.hangulArtistName);
            }
        }

        aliases.push(...gameRound.artistAliases);
    } else {
        if (gameRound.song.hangulSongName) {
            if (locale === LocaleType.KO) {
                aliases.push(gameRound.song.originalSongName);
            } else {
                aliases.push(gameRound.song.originalHangulSongName);
            }
        }

        aliases.push(...gameRound.songAliases);
    }

    if (aliases.length > 0) {
        footer.text = `${aliasesText}: ${aliases.join(", ")}`;
    }

    if (timeRemaining) {
        if (footer.text) {
            footer.text += "\n";
        }

        footer.text +=
            timeRemaining > 0
                ? `⏰ ${state.localizer.translateN(
                      messageContext.guildID,
                      "misc.plural.minute",
                      Math.ceil(timeRemaining)
                  )}`
                : `⏰ ${state.localizer.translate(
                      messageContext.guildID,
                      "misc.timeFinished"
                  )}!`;
    }

    const fact = Math.random() <= 0.05 ? getFact(messageContext.guildID) : null;

    const correctGuess = playerRoundResults.length > 0;
    let correctDescription = "";
    if (gameRound.bonusModifier > 1 || gameRound.isBonusArtist()) {
        let bonusType: string;
        if (gameRound.isBonusArtist() && gameRound.bonusModifier > 1) {
            bonusType = state.localizer.translate(
                messageContext.guildID,
                "misc.inGame.bonusExpArtistRound"
            );
        } else if (gameRound.bonusModifier > 1) {
            bonusType = state.localizer.translate(
                messageContext.guildID,
                "misc.inGame.bonusExpRound"
            );
        } else {
            bonusType = state.localizer.translate(
                messageContext.guildID,
                "misc.inGame.bonusArtistRound"
            );
        }

        correctDescription += `⭐__**${bonusType}**__⭐\n`;
    }

    if (correctGuess) {
        const correctGuesser = `${getMention(
            playerRoundResults[0].player.id
        )} ${
            playerRoundResults[0].streak >= 5
                ? `(🔥 ${friendlyFormattedNumber(
                      playerRoundResults[0].streak
                  )}) `
                : ""
        }`;

        correctDescription += state.localizer.translate(
            messageContext.guildID,
            "misc.inGame.correctGuess",
            {
                correctGuesser,
                expGain: friendlyFormattedNumber(playerRoundResults[0].expGain),
            }
        );
        if (playerRoundResults.length > 1) {
            const runnersUp = playerRoundResults.slice(1);
            let runnersUpDescription = runnersUp
                .map(
                    (x) =>
                        `${getMention(x.player.id)} (+${friendlyFormattedNumber(
                            x.expGain
                        )} EXP)`
                )
                .slice(0, MAX_RUNNERS_UP)
                .join("\n");

            if (runnersUp.length >= MAX_RUNNERS_UP) {
                runnersUpDescription += `\n${state.localizer.translate(
                    messageContext.guildID,
                    "misc.andManyOthers"
                )}`;
            }

            correctDescription += `\n\n**${state.localizer.translate(
                messageContext.guildID,
                "misc.inGame.runnersUp"
            )}**\n${runnersUpDescription}`;
        }
    }

    if (!correctGuess) {
        correctDescription = state.localizer.translate(
            messageContext.guildID,
            "misc.inGame.noCorrectGuesses"
        );
    }

    const useLargerScoreboard =
        scoreboard.getNumPlayers() > SCOREBOARD_FIELD_CUTOFF;

    let scoreboardTitle = "";
    if (!scoreboard.isEmpty() && !useLargerScoreboard) {
        scoreboardTitle = "\n\n";
        scoreboardTitle += bold(
            state.localizer.translate(
                messageContext.guildID,
                "command.score.scoreboardTitle"
            )
        );
    }

    let uniqueSongMessage = "";
    if (uniqueSongCounter && uniqueSongCounter.uniqueSongsPlayed > 0) {
        uniqueSongMessage = "\n";
        uniqueSongMessage += state.localizer.translate(
            messageContext.guildID,
            "misc.inGame.uniqueSongsPlayed",
            {
                uniqueSongCount: codeLine(
                    `${friendlyFormattedNumber(
                        uniqueSongCounter.uniqueSongsPlayed
                    )}/${friendlyFormattedNumber(uniqueSongCounter.totalSongs)}`
                ),
            }
        );
    }

    const description = `${correctDescription}\n${uniqueSongMessage} ${scoreboardTitle}`;

    let fields: Array<{ name: string; value: string; inline: boolean }>;
    let roundResultIDs: Array<string>;
    if (scoreboard instanceof TeamScoreboard) {
        const teamScoreboard = scoreboard as TeamScoreboard;
        roundResultIDs = playerRoundResults.map((x) =>
            teamScoreboard.getTeamOfPlayer(x.player.id).getID()
        );
    } else {
        roundResultIDs = playerRoundResults.map((x) => x.player.id);
    }

    if (useLargerScoreboard) {
        fields = scoreboard.getScoreboardEmbedThreeFields(
            MAX_SCOREBOARD_PLAYERS,
            false,
            true,
            roundResultIDs
        );
    } else {
        fields = scoreboard.getScoreboardEmbedFields(
            false,
            true,
            roundResultIDs
        );
    }

    if (fact) {
        fields.push({
            name: underline(
                state.localizer.translate(
                    messageContext.guildID,
                    "misc.gameMessages.didYouKnow.title"
                )
            ),
            value: fact,
            inline: false,
        });
    }

    let color: number;
    if (correctGuess) {
        if (await userBonusIsActive(playerRoundResults[0].player.id)) {
            color = EMBED_SUCCESS_BONUS_COLOR;
        } else {
            color = EMBED_SUCCESS_COLOR;
        }
    } else {
        color = EMBED_ERROR_COLOR;
    }

    const songAndArtist = bold(
        `"${getLocalizedSongName(
            gameRound.song,
            locale
        )}" - ${getLocalizedArtistName(gameRound.song, locale)}`
    );

    const embed = {
        color,
        title: `${songAndArtist} (${gameRound.song.publishDate.getFullYear()})`,
        url: `https://youtu.be/${gameRound.song.youtubeLink}`,
        description,
        fields,
    };

    const thumbnailUrl = `https://img.youtube.com/vi/${gameRound.song.youtubeLink}/hqdefault.jpg`;
    const footerText = `${friendlyFormattedNumber(
        gameRound.song.views
    )} ${state.localizer.translate(messageContext.guildID, "misc.views")}${
        footer.text ? `\n${footer.text}` : ""
    }`;

    if (isMultipleChoiceMode && gameRound.interactionMessage) {
        embed["thumbnail"] = { url: thumbnailUrl };
        embed["footer"] = { text: footerText };
        await gameRound.interactionMessage.edit({ embeds: [embed] });
        return gameRound.interactionMessage;
    }

    embed["thumbnailUrl"] = thumbnailUrl;
    embed["footerText"] = footerText;
    return sendInfoMessage(
        messageContext,
        embed,
        correctGuess && !isMultipleChoiceMode,
        false
    );
}

/**
 * Sends an embed displaying the currently selected GameOptions
 * @param messageContext - The Message Context
 * @param guildPreference - The corresponding GuildPreference
 * @param updatedOptions - The GameOptions which were modified
 * @param preset - Specifies whether the GameOptions were modified by a preset
 * @param allReset - Specifies whether all GameOptions were reset
 * @param footerText - The footer text
 */
export async function sendOptionsMessage(
    messageContext: MessageContext,
    guildPreference: GuildPreference,
    updatedOptions?: { option: GameOption; reset: boolean }[],
    preset = false,
    allReset = false,
    footerText?: string
): Promise<void> {
    if (guildPreference.gameOptions.forcePlaySongID) {
        await sendInfoMessage(
            messageContext,
            {
                title: "[DEBUG] Force Play Mode Active",
                description: `Force playing video ID: ${guildPreference.gameOptions.forcePlaySongID}`,
                footerText,
                thumbnailUrl: KmqImages.READING_BOOK,
            },
            true
        );
        return;
    }

    const totalSongs = await getAvailableSongCount(guildPreference);
    if (totalSongs === null) {
        sendErrorMessage(messageContext, {
            title: state.localizer.translate(
                messageContext.guildID,
                "misc.failure.retrievingSongData.title"
            ),
            description: state.localizer.translate(
                messageContext.guildID,
                "misc.failure.retrievingSongData.description",
                { helpCommand: `\`${process.env.BOT_PREFIX}help\`` }
            ),
        });
        return;
    }

    const gameOptions = guildPreference.gameOptions;
    const visibleLimitEnd = Math.min(
        totalSongs.countBeforeLimit,
        gameOptions.limitEnd
    );

    const visibleLimitStart = Math.min(
        totalSongs.countBeforeLimit,
        gameOptions.limitStart
    );

    let limit: string;
    if (gameOptions.limitStart === 0) {
        limit = friendlyFormattedNumber(visibleLimitEnd);
    } else {
        limit = state.localizer.translate(
            messageContext.guildID,
            "misc.formattedLimit",
            {
                limitStart: getOrdinalNum(visibleLimitStart),
                limitEnd: getOrdinalNum(visibleLimitEnd),
                songCount: friendlyFormattedNumber(totalSongs.count),
            }
        );
    }

    // Store the VALUE of ,[option]: [VALUE] into optionStrings
    // Null optionStrings values are set to "Not set" below
    const optionStrings = {};
    optionStrings[GameOption.LIMIT] = `${limit} / ${friendlyFormattedNumber(
        totalSongs.countBeforeLimit
    )}`;

    optionStrings[GameOption.GROUPS] = guildPreference.isGroupsMode()
        ? guildPreference.getDisplayedGroupNames()
        : null;
    optionStrings[GameOption.GENDER] = gameOptions.gender.join(", ");
    optionStrings[
        GameOption.CUTOFF
    ] = `${gameOptions.beginningYear} - ${gameOptions.endYear}`;
    optionStrings[GameOption.ARTIST_TYPE] = gameOptions.artistType;
    optionStrings[GameOption.ANSWER_TYPE] = gameOptions.answerType;
    optionStrings[GameOption.RELEASE_TYPE] = gameOptions.releaseType;
    optionStrings[GameOption.LANGUAGE_TYPE] = gameOptions.languageType;
    optionStrings[GameOption.SUBUNIT_PREFERENCE] =
        gameOptions.subunitPreference;
    optionStrings[GameOption.OST_PREFERENCE] = gameOptions.ostPreference;
    optionStrings[GameOption.MULTIGUESS] = gameOptions.multiGuessType;
    optionStrings[GameOption.SHUFFLE_TYPE] = gameOptions.shuffleType;
    optionStrings[GameOption.SEEK_TYPE] = gameOptions.seekType;
    optionStrings[GameOption.GUESS_MODE_TYPE] = gameOptions.guessModeType;
    optionStrings[GameOption.SPECIAL_TYPE] = gameOptions.specialType;
    optionStrings[GameOption.TIMER] = guildPreference.isGuessTimeoutSet()
        ? state.localizer.translate(
              messageContext.guildID,
              "command.options.timer",
              {
                  timerInSeconds: String(gameOptions.guessTimeout),
              }
          )
        : null;

    optionStrings[GameOption.DURATION] = guildPreference.isDurationSet()
        ? state.localizer.translate(
              messageContext.guildID,
              "command.options.duration",
              { durationInMinutes: String(gameOptions.duration) }
          )
        : null;

    optionStrings[GameOption.EXCLUDE] = guildPreference.isExcludesMode()
        ? guildPreference.getDisplayedExcludesGroupNames()
        : null;

    optionStrings[GameOption.INCLUDE] = guildPreference.isIncludesMode()
        ? guildPreference.getDisplayedIncludesGroupNames()
        : null;

    const generateConflictingCommandEntry = (
        commandValue: string,
        conflictingOption: string
    ): string =>
        `${strikethrough(commandValue)} (\`${
            process.env.BOT_PREFIX
        }${conflictingOption}\` ${italicize(
            state.localizer.translate(messageContext.guildID, "misc.conflict")
        )})`;

    const { gameSessions } = state;
    const isEliminationMode =
        gameSessions[messageContext.guildID] &&
        gameSessions[messageContext.guildID].gameType === GameType.ELIMINATION;

    // Special case: ,goal is conflicting only when current game is elimination
    if (guildPreference.isGoalSet()) {
        optionStrings[GameOption.GOAL] = String(gameOptions.goal);
        if (isEliminationMode) {
            optionStrings[GameOption.GOAL] = generateConflictingCommandEntry(
                optionStrings[GameOption.GOAL],
                `play ${GameType.ELIMINATION}`
            );
        }
    }

    const gameOptionConflictCheckMap = [
        {
            conflictCheck: guildPreference.isGroupsMode.bind(guildPreference),
            gameOption: GameOption.GROUPS,
        },
    ];

    // When an option is set that conflicts with others, visually show a conflict on those other options
    for (const gameOptionConflictCheck of gameOptionConflictCheckMap) {
        const doesConflict = gameOptionConflictCheck.conflictCheck();
        if (doesConflict) {
            for (const option of ConflictingGameOptions[
                gameOptionConflictCheck.gameOption
            ]) {
                if (optionStrings[option]) {
                    optionStrings[option] = generateConflictingCommandEntry(
                        optionStrings[option],
                        GameOptionCommand[gameOptionConflictCheck.gameOption]
                    );
                }
            }
        }
    }

    for (const option of Object.values(GameOption)) {
        optionStrings[option] =
            optionStrings[option] ||
            italicize(
                state.localizer.translate(
                    messageContext.guildID,
                    "command.options.notSet"
                )
            );
    }

    // Underline changed option
    if (updatedOptions) {
        for (const updatedOption of updatedOptions) {
            optionStrings[updatedOption.option as GameOption] = underline(
                optionStrings[updatedOption.option]
            );
        }
    }

    // Options excluded from embed fields since they are of higher importance (shown above them as part of the embed description)
    let priorityOptions = PriorityGameOption.map(
        (option) =>
            `${bold(process.env.BOT_PREFIX + GameOptionCommand[option])}: ${
                optionStrings[option]
            }`
    ).join("\n");

    priorityOptions = state.localizer.translate(
        messageContext.guildID,
        "command.options.overview",
        {
            limit: bold(limit),
            totalSongs: bold(
                friendlyFormattedNumber(totalSongs.countBeforeLimit)
            ),
            priorityOptions,
        }
    );

    const fieldOptions = Object.keys(GameOptionCommand).filter(
        (option) => !PriorityGameOption.includes(option as GameOption)
    );

    const ZERO_WIDTH_SPACE = "​";
    // Split non-priority options into three fields
    const fields = [
        {
            name: ZERO_WIDTH_SPACE,
            value: fieldOptions
                .slice(0, Math.ceil(fieldOptions.length / 3))
                .map(
                    (option) =>
                        `${bold(
                            process.env.BOT_PREFIX + GameOptionCommand[option]
                        )}: ${optionStrings[option]}`
                )
                .join("\n"),
            inline: true,
        },
        {
            name: ZERO_WIDTH_SPACE,
            value: fieldOptions
                .slice(
                    Math.ceil(fieldOptions.length / 3),
                    Math.ceil((2 * fieldOptions.length) / 3)
                )
                .map(
                    (option) =>
                        `${bold(
                            process.env.BOT_PREFIX + GameOptionCommand[option]
                        )}: ${optionStrings[option]}`
                )
                .join("\n"),
            inline: true,
        },
        {
            name: ZERO_WIDTH_SPACE,
            value: fieldOptions
                .slice(Math.ceil((2 * fieldOptions.length) / 3))
                .map(
                    (option) =>
                        `${bold(
                            process.env.BOT_PREFIX + GameOptionCommand[option]
                        )}: ${optionStrings[option]}`
                )
                .join("\n"),
            inline: true,
        },
    ];

    if (
        updatedOptions &&
        !allReset &&
        updatedOptions[0] &&
        updatedOptions[0].reset
    ) {
        footerText = state.localizer.translate(
            messageContext.guildID,
            "command.options.perCommandHelp",
            { helpCommand: `${process.env.BOT_PREFIX}help` }
        );
    }

    let title = "";
    if (updatedOptions === null || allReset) {
        title = state.localizer.translate(
            messageContext.guildID,
            "command.options.title"
        );
    } else {
        if (preset) {
            title = state.localizer.translate(
                messageContext.guildID,
                "command.options.preset"
            );
        } else {
            title = updatedOptions[0].option;
        }

        title =
            updatedOptions[0] && updatedOptions[0].reset
                ? state.localizer.translate(
                      messageContext.guildID,
                      "command.options.reset",
                      { presetOrOption: title }
                  )
                : state.localizer.translate(
                      messageContext.guildID,
                      "command.options.updated",
                      { presetOrOption: title }
                  );
    }

    await sendInfoMessage(
        messageContext,
        {
            title,
            description: priorityOptions,
            fields,
            footerText,
            thumbnailUrl: KmqImages.LISTENING,
        },
        true
    );
}

/**
 * Sends an embed displaying the winner of the session as well as the scoreboard
 * @param gameSession - The GameSession that has ended
 */
export async function sendEndGameMessage(
    gameSession: GameSession
): Promise<void> {
    const footerText = state.localizer.translate(
        gameSession.guildID,
        "misc.inGame.songsCorrectlyGuessed",
        {
            songCount: `${gameSession.getCorrectGuesses()}/${gameSession.getRoundsPlayed()}`,
        }
    );

    if (gameSession.scoreboard.isEmpty()) {
        await sendInfoMessage(new MessageContext(gameSession.textChannelID), {
            title: state.localizer.translate(
                gameSession.guildID,
                "misc.inGame.noWinners"
            ),
            footerText,
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
        });
    } else {
        const winners = gameSession.scoreboard.getWinners();
        let fields: Array<{ name: string; value: string; inline: boolean }>;
        const useLargerScoreboard =
            gameSession.scoreboard.getNumPlayers() > SCOREBOARD_FIELD_CUTOFF;

        if (useLargerScoreboard) {
            fields = gameSession.scoreboard.getScoreboardEmbedThreeFields(
                MAX_SCOREBOARD_PLAYERS,
                gameSession.gameType !== GameType.TEAMS,
                false
            );
        } else {
            fields = gameSession.scoreboard.getScoreboardEmbedFields(
                gameSession.gameType !== GameType.TEAMS,
                false
            );
        }

        const endGameMessage: GameInfoMessage = chooseWeightedRandom(
            await dbContext.kmq("game_messages")
        );

        if (endGameMessage) {
            fields.push({
                name: state.localizer.translate(
                    gameSession.guildID,
                    endGameMessage.title
                ),
                value: state.localizer.translate(
                    gameSession.guildID,
                    endGameMessage.message
                ),
                inline: false,
            });
        }

        await sendInfoMessage(new MessageContext(gameSession.textChannelID), {
            color:
                gameSession.gameType !== GameType.TEAMS &&
                (await userBonusIsActive(winners[0].id))
                    ? EMBED_SUCCESS_BONUS_COLOR
                    : EMBED_SUCCESS_COLOR,
            description: !useLargerScoreboard
                ? bold(
                      state.localizer.translate(
                          gameSession.guildID,
                          "command.score.scoreboardTitle"
                      )
                  )
                : null,
            thumbnailUrl: winners[0].getAvatarURL(),
            title: `🎉 ${gameSession.scoreboard.getWinnerMessage(
                gameSession.guildID
            )} 🎉`,
            fields,
            footerText,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            style: 5,
                            url: VOTE_LINK,
                            type: 2 as const,
                            emoji: { name: "✅" },
                            label: state.localizer.translate(
                                gameSession.guildID,
                                "misc.interaction.vote"
                            ),
                        },
                        {
                            style: 5,
                            url: REVIEW_LINK,
                            type: 2 as const,
                            emoji: { name: "📖" },
                            label: state.localizer.translate(
                                gameSession.guildID,
                                "misc.interaction.leaveReview"
                            ),
                        },
                        {
                            style: 5,
                            url: "https://discord.gg/RCuzwYV",
                            type: 2,
                            emoji: { name: "🎵" },
                            label: state.localizer.translate(
                                gameSession.guildID,
                                "misc.interaction.officialKmqServer"
                            ),
                        },
                    ],
                },
            ],
        });
    }
}

/**
 * Sends a paginated embed
 * @param message - The Message object
 * @param embeds - A list of embeds to paginate over
 * @param components - A list of components to add to the embed
 * @param startPage - The page to start on
 */
export async function sendPaginationedEmbed(
    message: GuildTextableMessage,
    embeds: Array<Eris.EmbedOptions> | Array<EmbedGenerator>,
    components?: Array<Eris.ActionRow>,
    startPage = 1
): Promise<Eris.Message> {
    if (embeds.length > 1) {
        if (
            await textPermissionsCheck(
                message.channel.id,
                message.guildID,
                message.author.id
            )
        ) {
            return EmbedPaginator.createPaginationEmbed(
                message,
                embeds,
                { timeout: 60000, startPage, cycling: true },
                components
            );
        }

        return null;
    }

    let embed: Eris.EmbedOptions;
    if (typeof embeds[0] === "function") {
        embed = await embeds[0]();
    } else {
        embed = embeds[0];
    }

    return sendMessage(
        message.channel.id,
        { embeds: [embed], components },
        null,
        message.author.id
    );
}

/**
 * Sends an embed displaying the scoreboard of the GameSession
 * @param message - The Message object
 * @param gameSession - The GameSession
 */
export async function sendScoreboardMessage(
    message: GuildTextableMessage,
    gameSession: GameSession
): Promise<Eris.Message> {
    if (
        gameSession.scoreboard.isEmpty() &&
        gameSession.gameType !== GameType.ELIMINATION
    ) {
        return sendInfoMessage(MessageContext.fromMessage(message), {
            color: EMBED_SUCCESS_COLOR,
            description: "(╯°□°）╯︵ ┻━┻",
            title: state.localizer.translate(
                message.guildID,
                "command.score.scoreboardTitle"
            ),
        });
    }

    const winnersFieldSubsets = chunkArray(
        gameSession.scoreboard.getScoreboardEmbedFields(true, true),
        EMBED_FIELDS_PER_PAGE
    );

    let footerText = state.localizer.translate(
        message.guildID,
        "misc.classic.yourScore",
        {
            score: String(
                gameSession.scoreboard.getPlayerScore(message.author.id)
            ),
        }
    );

    if (gameSession.gameType === GameType.ELIMINATION) {
        const eliminationScoreboard =
            gameSession.scoreboard as EliminationScoreboard;

        footerText = state.localizer.translate(
            message.guildID,
            "misc.elimination.yourLives",
            {
                lives: String(
                    eliminationScoreboard.getPlayerLives(message.author.id)
                ),
            }
        );
    } else if (gameSession.gameType === GameType.TEAMS) {
        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        footerText = state.localizer.translate(
            message.guildID,
            "misc.team.yourTeamScore",
            {
                teamScore: String(
                    teamScoreboard.getTeamOfPlayer(message.author.id).getScore()
                ),
            }
        );
        footerText += "\n";
        footerText += state.localizer.translate(
            message.guildID,
            "misc.team.yourScore",
            { score: String(teamScoreboard.getPlayerScore(message.author.id)) }
        );
    }

    const embeds: Array<Eris.EmbedOptions> = winnersFieldSubsets.map(
        (winnersFieldSubset) => ({
            color: EMBED_SUCCESS_COLOR,
            title: state.localizer.translate(
                message.guildID,
                "command.score.scoreboardTitle"
            ),
            fields: winnersFieldSubset,
            footer: {
                text: footerText,
            },
        })
    );

    return sendPaginationedEmbed(message, embeds);
}

/**
 * Disconnects the bot from the voice channel of the  message's originating guild
 * @param message - The Message object
 */
export function disconnectVoiceConnection(message: GuildTextableMessage): void {
    state.client.closeVoiceConnection(message.guildID);
}

/**
 * @param message - The Message object
 * @returns the bot's voice connection in the message's originating guild
 */
export function getVoiceConnection(
    message: Eris.Message
): Eris.VoiceConnection {
    const voiceConnection = state.client.voiceConnections.get(message.guildID);
    return voiceConnection;
}

/**
 * @param message - The Message
 * @returns whether the message's author and the bot are in the same voice channel
 */
export function areUserAndBotInSameVoiceChannel(
    message: Eris.Message
): boolean {
    const botVoiceConnection = state.client.voiceConnections.get(
        message.guildID
    );

    if (!message.member.voiceState || !botVoiceConnection) {
        return false;
    }

    return message.member.voiceState.channelID === botVoiceConnection.channelID;
}

/**
 * @param messageContext - The messageContext object
 * @returns the voice channel that the message's author is in
 */
export function getUserVoiceChannel(
    messageContext: MessageContext
): Eris.VoiceChannel {
    const member = state.client.guilds
        .get(messageContext.guildID)
        .members.get(messageContext.author.id);

    const voiceChannelID = member.voiceState.channelID;
    if (!voiceChannelID) return null;
    return state.client.getChannel(voiceChannelID) as Eris.VoiceChannel;
}

/**
 * @param voiceChannelID - The voice channel ID
 * @returns the voice channel that the message's author is in
 */
export function getVoiceChannel(voiceChannelID: string): Eris.VoiceChannel {
    const voiceChannel = state.client.getChannel(
        voiceChannelID
    ) as Eris.VoiceChannel;

    return voiceChannel;
}

/**
 * @param voiceChannelID - The voice channel to check
 * @returns the users in the voice channel, excluding bots
 */
export function getCurrentVoiceMembers(
    voiceChannelID: string
): Array<Eris.Member> {
    const voiceChannel = getVoiceChannel(voiceChannelID);
    if (!voiceChannel) {
        logger.warn(`Voice channel not in cache: ${voiceChannelID}`);
        return [];
    }

    return voiceChannel.voiceMembers.filter((x) => !x.bot);
}

/**
 * @param voiceChannelID - The voice channel to check
 * @returns the number of persons in the voice channel, excluding bots
 */
export function getNumParticipants(voiceChannelID: string): number {
    return getCurrentVoiceMembers(voiceChannelID).length;
}

/**
 * @param message - The Message object
 * @returns whether the bot has permissions to join the message author's currently active voice channel
 */
export function voicePermissionsCheck(message: GuildTextableMessage): boolean {
    const voiceChannel = getUserVoiceChannel(
        MessageContext.fromMessage(message)
    );

    const messageContext = MessageContext.fromMessage(message);
    const missingPermissions = REQUIRED_VOICE_PERMISSIONS.filter(
        (permission) =>
            !voiceChannel
                .permissionsOf(process.env.BOT_CLIENT_ID)
                .has(permission)
    );

    if (missingPermissions.length > 0) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext
            )} | Missing Voice Channel [${missingPermissions.join(
                ", "
            )}] permissions`
        );

        sendErrorMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "misc.failure.missingPermissions.title"
            ),
            description: missingPermissionsText(
                message.guildID,
                missingPermissions
            ),
        });
        return false;
    }

    const channelFull =
        voiceChannel.userLimit &&
        voiceChannel.voiceMembers.size >= voiceChannel.userLimit;

    if (channelFull) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Channel full`);
        sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "misc.failure.vcFull.title"
            ),
            description: state.localizer.translate(
                message.guildID,
                "misc.failure.vcFull.description"
            ),
        });
        return false;
    }

    const afkChannel = voiceChannel.id === voiceChannel.guild.afkChannelID;
    if (afkChannel) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext
            )} | Attempted to start game in AFK voice channel`
        );

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "misc.failure.afkChannel.title"
            ),
            description: state.localizer.translate(
                message.guildID,
                "misc.failure.afkChannel.description"
            ),
        });
        return false;
    }

    return true;
}

/**
 * @param guildID - The guild ID
 * @returns whether the bot is alone 😔
 */
export function checkBotIsAlone(guildID: string): boolean {
    const voiceConnection = state.client.voiceConnections.get(guildID);
    if (!voiceConnection || !voiceConnection.channelID) return true;
    const channel = state.client.getChannel(
        voiceConnection.channelID
    ) as Eris.VoiceChannel;

    if (channel.voiceMembers.size === 0) return true;
    if (
        channel.voiceMembers.size === 1 &&
        channel.voiceMembers.has(process.env.BOT_CLIENT_ID)
    ) {
        return true;
    }

    return false;
}

/** @returns the debug TextChannel */
export function getDebugChannel(): Promise<Eris.TextChannel> {
    if (!process.env.DEBUG_SERVER_ID || !process.env.DEBUG_TEXT_CHANNEL_ID)
        return null;
    const debugGuild = state.client.guilds.get(process.env.DEBUG_SERVER_ID);
    if (!debugGuild) return null;
    return fetchChannel(process.env.DEBUG_TEXT_CHANNEL_ID);
}

/**
 * @param guildID - The guild ID
 * @returns the number of users required for a majority
 */
export function getMajorityCount(guildID: string): number {
    const voiceChannelID =
        state.client.voiceConnections.get(guildID)?.channelID;

    if (voiceChannelID) {
        return Math.floor(getNumParticipants(voiceChannelID) * 0.5) + 1;
    }

    return 0;
}

/**
 * Sends an alert to the message webhook
 * @param title - The embed title
 * @param description - the embed description
 * @param color - The embed color
 * @param avatarUrl - The avatar URl to show on the embed
 */
export function sendDebugAlertWebhook(
    title: string,
    description: string,
    color: number,
    avatarUrl: string
): void {
    if (!process.env.ALERT_WEBHOOK_URL) return;
    axios.post(process.env.ALERT_WEBHOOK_URL, {
        embeds: [
            {
                title,
                description,
                color,
            },
        ],
        username: "Kimiqo",
        avatar_url: avatarUrl,
        footerText: getKmqCurrentVersion(),
    });
}

/**
 * Send the bookmarked songs to the corresponding users
 * @param guildID - The guild where the songs were bookmarked
 * @param bookmarkedSongs - The bookmarked songs
 */
export async function sendBookmarkedSongs(
    guildID: string,
    bookmarkedSongs: {
        [userID: string]: Map<string, QueriedSong>;
    }
): Promise<void> {
    const locale = getGuildLocale(guildID);
    for (const [userID, songs] of Object.entries(bookmarkedSongs)) {
        const allEmbedFields: Array<{
            name: string;
            value: string;
            inline: boolean;
        }> = [...songs].map((song) => ({
            name: `${bold(
                `"${getLocalizedSongName(
                    song[1],
                    locale
                )}" - ${getLocalizedArtistName(song[1], locale)}`
            )} (${standardDateFormat(song[1].publishDate)})`,
            value: `[${friendlyFormattedNumber(
                song[1].views
            )} ${state.localizer.translate(
                guildID,
                "misc.views"
            )}](https://youtu.be/${song[1].youtubeLink})`,
            inline: false,
        }));

        for (const fields of chunkArray(allEmbedFields, 25)) {
            const embed: Eris.EmbedOptions = {
                author: {
                    name: "Kimiqo",
                    icon_url: KmqImages.READING_BOOK,
                },
                title: bold(
                    state.localizer.translate(
                        guildID,
                        "misc.interaction.bookmarked.message.title"
                    )
                ),
                fields,
                footer: {
                    text: state.localizer.translate(
                        guildID,
                        "misc.interaction.bookmarked.message.playedOn",
                        { date: standardDateFormat(new Date()) }
                    ),
                },
            };

            await sendDmMessage(userID, { embeds: [embed] });
            await delay(1000);
        }
    }
}

function withinInteractionInterval(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction
): boolean {
    return (
        new Date().getTime() - interaction.createdAt <=
        MAX_INTERACTION_RESPONSE_TIME
    );
}

function interactionRejectionHandler(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction,
    err
): void {
    if (err.code === 10062) {
        logger.warn(
            `${getDebugLogHeader(
                interaction
            )} | Interaction acknowledge (unknown interaction)`
        );
    } else {
        logger.error(
            `${getDebugLogHeader(
                interaction
            )} | Interaction acknowledge (failure message) failed. err = ${
                err.stack
            }`
        );
    }
}

/**
 * Attempts to acknowledge an interaction
 * @param interaction - The originating interaction
 */
export async function tryInteractionAcknowledge(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction
): Promise<void> {
    if (!withinInteractionInterval(interaction)) {
        return;
    }

    try {
        await interaction.acknowledge();
    } catch (err) {
        interactionRejectionHandler(interaction, err);
    }
}

/**
 * Attempts to send a success response to an interaction
 * @param interaction - The originating interaction
 * @param title - The embed title
 * @param description - The embed description
 */
export async function tryCreateInteractionSuccessAcknowledgement(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction,
    title: string,
    description: string
): Promise<void> {
    if (!withinInteractionInterval(interaction)) {
        return;
    }

    try {
        await interaction.createMessage({
            embeds: [
                {
                    color: (await userBonusIsActive(interaction.member?.id))
                        ? EMBED_SUCCESS_BONUS_COLOR
                        : EMBED_SUCCESS_COLOR,
                    author: {
                        name: interaction.member?.username,
                        icon_url: interaction.member?.avatarURL,
                    },
                    title: bold(title),
                    description,
                    thumbnail: { url: KmqImages.THUMBS_UP },
                },
            ],
            flags: 64,
        });
    } catch (err) {
        interactionRejectionHandler(interaction, err);
    }
}

/**
 * Attempts to send a error message to an interaction
 * @param interaction - The originating interaction
 * @param description - The embed description
 */
export async function tryCreateInteractionErrorAcknowledgement(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction,
    description: string
): Promise<void> {
    if (!withinInteractionInterval(interaction)) {
        return;
    }

    try {
        await interaction.createMessage({
            embeds: [
                {
                    color: EMBED_ERROR_COLOR,
                    author: {
                        name: interaction.member?.username,
                        icon_url: interaction.member?.avatarURL,
                    },
                    title: bold(
                        state.localizer.translate(
                            interaction.guildID,
                            "misc.interaction.title.failure"
                        )
                    ),
                    description,
                    thumbnail: { url: KmqImages.DEAD },
                },
            ],
            flags: 64,
        });
    } catch (err) {
        interactionRejectionHandler(interaction, err);
    }
}

/**
 * @param guildID - The guild ID
 * @returns the locale associated with the given guild
 */
export function getGuildLocale(guildID: string): LocaleType {
    return state.locales[guildID] ?? DEFAULT_LOCALE;
}

/**
 * Sends the power hour notification to the KMQ server
 */
export function sendPowerHourNotification(): void {
    if (
        !process.env.POWER_HOUR_NOTIFICATION_CHANNEL_ID ||
        !process.env.POWER_HOUR_NOTIFICATION_ROLE_ID
    ) {
        return;
    }

    logger.info("Sending power hour notification");
    sendInfoMessage(
        new MessageContext(process.env.POWER_HOUR_NOTIFICATION_CHANNEL_ID),
        {
            title: "⬆️ KMQ Power Hour Starts Now! ⬆️",
            description: "Earn 2x EXP for the next hour!",
            thumbnailUrl: KmqImages.LISTENING,
        },
        false,
        true,
        `<@&${process.env.POWER_HOUR_NOTIFICATION_ROLE_ID}>`
    );
}
