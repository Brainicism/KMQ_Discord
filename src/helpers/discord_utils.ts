/* eslint-disable @typescript-eslint/no-use-before-define */
import Eris from "eris";
import EmbedPaginator from "eris-pagination";
import axios from "axios";
import * as uuid from "uuid";
import type GuildPreference from "../structures/guild_preference";
import type GameSession from "../structures/game_session";
import { IPCLogger } from "../logger";
import {
    getAvailableSongCount,
    getKmqCurrentVersion,
    getLocalizedArtistName,
    getLocalizedSongName,
    isPremiumRequest,
    userBonusIsActive,
} from "./game_utils";
import { getFact } from "../fact_generator";
import type { GuildTextableMessage } from "../types";
import {
    GameOptionCommand,
    PriorityGameOption,
    ConflictingGameOptions,
} from "../types";
import {
    chunkArray,
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
import State from "../state";
import type Scoreboard from "../structures/scoreboard";
import GameRound from "../structures/game_round";
import dbContext from "../database_context";
import type EliminationScoreboard from "../structures/elimination_scoreboard";
import TeamScoreboard from "../structures/team_scoreboard";
import { KmqImages } from "../constants";
import MessageContext from "../structures/message_context";
import { REVIEW_LINK, VOTE_LINK } from "../commands/game_commands/vote";
import { LocaleType } from "../enums/locale_type";
import type Round from "../structures/round";
import Session from "../structures/session";
import MusicRound from "../structures/music_round";
import type EmbedPayload from "../interfaces/embed_payload";
import type GameInfoMessage from "../interfaces/game_info_message";
import type QueriedSong from "../interfaces/queried_song";
import type GameOptions from "../interfaces/game_options";
import type UniqueSongCounter from "../interfaces/unique_song_counter";
import { GuessModeType } from "../enums/option_types/guess_mode_type";
import { GameOption } from "../enums/game_option_name";
import { GameType } from "../enums/game_type";
import LocalizationManager from "./localization_manager";

const logger = new IPCLogger("discord_utils");
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

const MAX_SCOREBOARD_PLAYERS = 30;
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
    const session = Session.getSession(context.guildID);
    let sessionType: string;
    if (session) {
        if (session.isMusicSession()) {
            sessionType = "MusicSession";
        } else {
            sessionType = "GameSession";
        }
    } else {
        sessionType = "No active session";
    }

    let header: string;
    if (context instanceof Eris.Message) {
        header = `gid: ${context.guildID}, uid: ${context.author.id}, tid: ${context.channel.id}`;
    } else if (
        context instanceof Eris.ComponentInteraction ||
        context instanceof Eris.CommandInteraction
    ) {
        header = `gid: ${context.guildID}, uid: ${context.member?.id}, tid: ${context.channel.id}`;
    } else {
        header = `gid: ${context.guildID}, tid: ${context.textChannelID}`;
    }

    return `${header} | sessionType = ${sessionType}`;
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
    return LocalizationManager.localizer.translate(
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
    const { client, ipc } = State;

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
    const { client, ipc } = State;

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
            title: LocalizationManager.localizer.translate(
                guildID,
                "misc.failure.missingPermissions.title"
            ),
            description: LocalizationManager.localizer.translate(
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
        return await State.client.createMessage(
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
    const { client } = State;
    let dmChannel: Eris.PrivateChannel;
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
 * Create and return a Discord embed with the specified payload
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - What to include in the message
 * @param boldTitle - Whether to bold the title
 *  @returns a Discord embed
 */
export function generateEmbed(
    messageContext: MessageContext,
    embedPayload: EmbedPayload,
    boldTitle = true
): Eris.EmbedOptions {
    const author =
        embedPayload.author == null || embedPayload.author
            ? embedPayload.author
            : messageContext.author;

    return {
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
}

/**
 * Sends an info embed with the specified title/description/footer text
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - What to include in the message
 * @param reply - Whether to reply to the given message
 * @param boldTitle - Whether to bold the title
 * @param content - Plain text content
 * @param additionalEmbeds - Additional embeds to include in the message
 */
export async function sendInfoMessage(
    messageContext: MessageContext,
    embedPayload: EmbedPayload,
    reply = false,
    boldTitle = true,
    content?: string,
    additionalEmbeds: Array<Eris.EmbedOptions> = []
): Promise<Eris.Message<Eris.TextableChannel>> {
    if (embedPayload.description && embedPayload.description.length > 2048) {
        return sendErrorMessage(messageContext, {
            title: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.failure.error"
            ),
            description: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.failure.messageTooLong"
            ),
        });
    }

    const embed = generateEmbed(messageContext, embedPayload, boldTitle);

    return sendMessage(
        messageContext.textChannelID,
        {
            embeds: [embed, ...additionalEmbeds],
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

function getAliasFooter(
    round: Round,
    guessModeType: GuessModeType,
    locale: LocaleType
): string {
    const aliases: Array<string> = [];
    if (guessModeType === GuessModeType.ARTIST) {
        if (round.song.hangulArtistName) {
            if (locale === LocaleType.KO) {
                aliases.push(round.song.artistName);
            } else {
                aliases.push(round.song.hangulArtistName);
            }
        }

        aliases.push(...round.artistAliases);
    } else {
        if (round.song.hangulSongName) {
            if (locale === LocaleType.KO) {
                aliases.push(round.song.originalSongName);
            } else {
                aliases.push(round.song.originalHangulSongName);
            }
        }

        aliases.push(...round.songAliases);
    }

    if (aliases.length === 0) {
        return "";
    }

    const aliasesText = LocalizationManager.localizer.translateByLocale(
        locale,
        "misc.inGame.aliases"
    );

    return `${aliasesText}: ${aliases.join(", ")}`;
}

function getDurationFooter(
    locale: LocaleType,
    timeRemaining: number,
    nonEmptyFooter: boolean
): string {
    if (!timeRemaining) {
        return "";
    }

    let durationText = "";
    if (nonEmptyFooter) {
        durationText += "\n";
    }

    durationText +=
        timeRemaining > 0
            ? `⏰ ${LocalizationManager.localizer.translateNByLocale(
                  locale,
                  "misc.plural.minute",
                  Math.ceil(timeRemaining)
              )}`
            : `⏰ ${LocalizationManager.localizer.translateByLocale(
                  locale,
                  "misc.timeFinished"
              )}!`;

    return durationText;
}

/**
 * Sends a message displaying song/game related information
 * @param messageContext - An object to pass along relevant parts of Eris.Message
 * @param scoreboard - The GameSession's corresponding Scoreboard
 * @param session - The session generating this end round message
 * @param guessModeType - The type of guess mode
 * @param isMultipleChoiceMode  - Whether the game is in multiple choice mode
 * @param timeRemaining - The time remaining for the duration option
 * @param uniqueSongCounter - The unique song counter
 */
export async function sendRoundMessage(
    messageContext: MessageContext,
    scoreboard: Scoreboard,
    session: Session,
    guessModeType: GuessModeType,
    isMultipleChoiceMode: boolean,
    timeRemaining?: number,
    uniqueSongCounter?: UniqueSongCounter
): Promise<Eris.Message<Eris.TextableChannel>> {
    const isMusicSession = session.isMusicSession();
    const useLargerScoreboard =
        !isMusicSession && scoreboard.shouldUseLargerScoreboard();

    let scoreboardTitle = "";
    if (!isMusicSession && !useLargerScoreboard) {
        scoreboardTitle = "\n\n";
        scoreboardTitle += bold(
            LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.score.scoreboardTitle"
            )
        );
    }

    const round = session.round;
    const playerRoundResults =
        round instanceof GameRound ? round.playerRoundResults : [];

    const description = `${round.getEndRoundDescription(
        messageContext,
        uniqueSongCounter,
        playerRoundResults
    )}${scoreboardTitle}`;

    let fields: Array<{ name: string; value: string; inline: boolean }> = [];
    let roundResultIDs: Array<string>;
    if (scoreboard instanceof TeamScoreboard) {
        const teamScoreboard = scoreboard as TeamScoreboard;
        roundResultIDs = playerRoundResults.map(
            (x) => teamScoreboard.getTeamOfPlayer(x.player.id).id
        );
    } else {
        roundResultIDs = playerRoundResults.map((x) => x.player.id);
    }

    if (!isMusicSession) {
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
    }

    const fact = Math.random() <= 0.05 ? getFact(messageContext.guildID) : null;
    if (fact) {
        fields.push({
            name: underline(
                LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.gameMessages.didYouKnow.title"
                )
            ),
            value: fact,
            inline: false,
        });
    }

    const correctGuess = playerRoundResults.length > 0;
    const locale = State.getGuildLocale(messageContext.guildID);

    const songAndArtist = bold(
        `"${getLocalizedSongName(
            round.song,
            locale
        )}" - ${getLocalizedArtistName(round.song, locale)}`
    );

    const embed: EmbedPayload = {
        color: round.getEndRoundColor(
            correctGuess,
            await userBonusIsActive(
                playerRoundResults[0]?.player.id ?? messageContext.author.id
            )
        ),
        title: `${songAndArtist} (${round.song.publishDate.getFullYear()})`,
        url: `https://youtu.be/${round.song.youtubeLink}`,
        description,
        fields,
    };

    const views = `${friendlyFormattedNumber(
        round.song.views
    )} ${LocalizationManager.localizer.translate(
        messageContext.guildID,
        "misc.views"
    )}\n`;

    const aliases = getAliasFooter(round, guessModeType, locale);
    const duration = getDurationFooter(
        locale,
        timeRemaining,
        [views, aliases].every((x) => x.length > 0)
    );

    const footerText = `${views}${aliases}${duration}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${round.song.youtubeLink}/hqdefault.jpg`;
    if (round instanceof GameRound) {
        if (isMultipleChoiceMode && round.interactionMessage) {
            embed["thumbnail"] = { url: thumbnailUrl };
            embed["footer"] = { text: footerText };
            await round.interactionMessage.edit({ embeds: [embed as Object] });
            return round.interactionMessage;
        }
    }

    if (round instanceof MusicRound) {
        const buttons: Array<Eris.InteractionButton> = [];
        round.interactionSkipUUID = uuid.v4();
        buttons.push({
            type: 2,
            style: 1,
            label: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.skip"
            ),
            custom_id: round.interactionSkipUUID,
        });

        buttons.push({
            type: 2,
            style: 1,
            label: LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.bookmark"
            ),
            custom_id: "bookmark",
        });

        round.interactionComponents = [{ type: 1, components: buttons }];
        embed.components = round.interactionComponents;
    }

    embed.thumbnailUrl = thumbnailUrl;
    embed.footerText = footerText;
    return sendInfoMessage(
        messageContext,
        embed,
        correctGuess && !isMultipleChoiceMode,
        false
    );
}

/**
 * Get a sentence describing the current limit
 * @param guildID - The ID of the guild where the limit is sent
 * @param gameOptions - The game options
 * @param totalSongs - The song count
 *  @returns a string describing the limit
 */
export function getFormattedLimit(
    guildID: string,
    gameOptions: GameOptions,
    totalSongs: { count: number; countBeforeLimit: number }
): string {
    const visibleLimitEnd = Math.min(
        totalSongs.countBeforeLimit,
        gameOptions.limitEnd
    );

    const visibleLimitStart = Math.min(
        totalSongs.countBeforeLimit,
        gameOptions.limitStart
    );

    if (gameOptions.limitStart === 0) {
        return friendlyFormattedNumber(visibleLimitEnd);
    }

    return LocalizationManager.localizer.translate(
        guildID,
        "misc.formattedLimit",
        {
            limitStart: getOrdinalNum(visibleLimitStart),
            limitEnd: getOrdinalNum(visibleLimitEnd),
            songCount: friendlyFormattedNumber(totalSongs.count),
        }
    );
}

/**
 * Creates an embed displaying the currently selected GameOptions
 * @param messageContext - The Message Context
 * @param guildPreference - The corresponding GuildPreference
 * @param updatedOptions - The GameOptions which were modified
 * @param preset - Specifies whether the GameOptions were modified by a preset
 * @param allReset - Specifies whether all GameOptions were reset
 * @param footerText - The footer text
 * @param isMusicSession - Whether the session is a MusicSession
 *  @returns an embed of current game options
 */
export async function generateOptionsMessage(
    messageContext: MessageContext,
    guildPreference: GuildPreference,
    updatedOptions?: { option: GameOption; reset: boolean }[],
    preset = false,
    allReset = false,
    footerText?: string,
    isMusicSession = false
): Promise<EmbedPayload> {
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

    const guildID = messageContext.guildID;
    const premiumRequest = await isPremiumRequest(
        guildID,
        messageContext.author.id
    );

    const totalSongs = await getAvailableSongCount(
        guildPreference,
        premiumRequest
    );

    if (totalSongs === null) {
        sendErrorMessage(messageContext, {
            title: LocalizationManager.localizer.translate(
                guildID,
                "misc.failure.retrievingSongData.title"
            ),
            description: LocalizationManager.localizer.translate(
                guildID,
                "misc.failure.retrievingSongData.description",
                { helpCommand: `\`${process.env.BOT_PREFIX}help\`` }
            ),
        });
        return;
    }

    const gameOptions = guildPreference.gameOptions;
    const limit = getFormattedLimit(guildID, gameOptions, totalSongs);

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
        ? LocalizationManager.localizer.translate(
              guildID,
              "command.options.timer",
              {
                  timerInSeconds: String(gameOptions.guessTimeout),
              }
          )
        : null;

    optionStrings[GameOption.DURATION] = guildPreference.isDurationSet()
        ? LocalizationManager.localizer.translate(
              guildID,
              "command.options.duration",
              {
                  durationInMinutes: String(gameOptions.duration),
              }
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
            LocalizationManager.localizer.translate(guildID, "misc.conflict")
        )})`;

    const session = Session.getSession(guildID);
    const isEliminationMode =
        session?.isGameSession() && session.gameType === GameType.ELIMINATION;

    // Special case: goal is conflicting only when current game is elimination
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
                LocalizationManager.localizer.translate(
                    guildID,
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

    // Special case: disable these options in a music session
    if (isMusicSession) {
        const disabledOptions = [
            GameOption.GUESS_MODE_TYPE,
            GameOption.SEEK_TYPE,
            GameOption.MULTIGUESS,
            GameOption.ANSWER_TYPE,
            GameOption.GOAL,
            GameOption.SPECIAL_TYPE,
            GameOption.TIMER,
        ];

        for (const option of disabledOptions) {
            optionStrings[option] = null;
        }
    }

    const optionsOverview = LocalizationManager.localizer.translate(
        messageContext.guildID,
        "command.options.overview",
        {
            limit: bold(limit),
            totalSongs: bold(
                friendlyFormattedNumber(totalSongs.countBeforeLimit)
            ),
        }
    );

    // Options excluded from embed fields since they are of higher importance (shown above them as part of the embed description)
    const priorityOptions = PriorityGameOption.filter(
        (option) => optionStrings[option]
    )
        .map(
            (option) =>
                `${bold(process.env.BOT_PREFIX + GameOptionCommand[option])}: ${
                    optionStrings[option]
                }`
        )
        .join("\n");

    let nonPremiumGameWarning = "";
    if (premiumRequest && session?.isGameSession() && !session.isPremium()) {
        nonPremiumGameWarning = italicize(
            LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.options.premiumOptionsNonPremiumGame"
            )
        );
    }

    const fieldOptions = Object.keys(GameOptionCommand)
        .filter((option) => optionStrings[option as GameOption])
        .filter((option) => !PriorityGameOption.includes(option as GameOption));

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
        footerText = LocalizationManager.localizer.translate(
            messageContext.guildID,
            "command.options.perCommandHelp",
            { helpCommand: `${process.env.BOT_PREFIX}help` }
        );
    } else if (isMusicSession) {
        footerText = LocalizationManager.localizer.translate(
            messageContext.guildID,
            "command.options.musicSessionNotAvailable"
        );
    }

    let title = "";
    if (updatedOptions === null || allReset) {
        title = LocalizationManager.localizer.translate(
            messageContext.guildID,
            "command.options.title"
        );
    } else {
        if (preset) {
            title = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.options.preset"
            );
        } else {
            title = updatedOptions[0].option;
        }

        title =
            updatedOptions[0] && updatedOptions[0].reset
                ? LocalizationManager.localizer.translate(
                      messageContext.guildID,
                      "command.options.reset",
                      { presetOrOption: title }
                  )
                : LocalizationManager.localizer.translate(
                      messageContext.guildID,
                      "command.options.updated",
                      { presetOrOption: title }
                  );
    }

    let description = "";
    if (nonPremiumGameWarning) {
        description = nonPremiumGameWarning + "\n\n";
    }

    description += optionsOverview;
    description += "\n\n";
    description += priorityOptions;

    return {
        color: premiumRequest ? EMBED_SUCCESS_BONUS_COLOR : null,
        title,
        description,
        fields,
        footerText,
    };
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
    const optionsEmbed = generateOptionsMessage(
        messageContext,
        guildPreference,
        updatedOptions,
        preset,
        allReset,
        footerText
    );

    await sendInfoMessage(messageContext, await optionsEmbed, true);
}

/**
 * Sends an embed displaying the winner of the session as well as the scoreboard
 * @param gameSession - The GameSession that has ended
 */
export async function sendEndGameMessage(
    gameSession: GameSession
): Promise<void> {
    const footerText = LocalizationManager.localizer.translate(
        gameSession.guildID,
        "misc.inGame.songsCorrectlyGuessed",
        {
            songCount: `${gameSession.getCorrectGuesses()}/${gameSession.getRoundsPlayed()}`,
        }
    );

    if (gameSession.scoreboard.getWinners().length === 0) {
        await sendInfoMessage(new MessageContext(gameSession.textChannelID), {
            title: LocalizationManager.localizer.translate(
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
            gameSession.scoreboard.shouldUseLargerScoreboard();

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
                name: LocalizationManager.localizer.translate(
                    gameSession.guildID,
                    endGameMessage.title
                ),
                value: LocalizationManager.localizer.translate(
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
                      LocalizationManager.localizer.translate(
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
                            label: LocalizationManager.localizer.translate(
                                gameSession.guildID,
                                "misc.interaction.vote"
                            ),
                        },
                        {
                            style: 5,
                            url: REVIEW_LINK,
                            type: 2 as const,
                            emoji: { name: "📖" },
                            label: LocalizationManager.localizer.translate(
                                gameSession.guildID,
                                "misc.interaction.leaveReview"
                            ),
                        },
                        {
                            style: 5,
                            url: "https://discord.gg/RCuzwYV",
                            type: 2,
                            emoji: { name: "🎵" },
                            label: LocalizationManager.localizer.translate(
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
    const winnersFieldSubsets = chunkArray(
        gameSession.scoreboard.getScoreboardEmbedFields(true, true),
        EMBED_FIELDS_PER_PAGE
    );

    let footerText = LocalizationManager.localizer.translate(
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

        footerText = LocalizationManager.localizer.translate(
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
        footerText = LocalizationManager.localizer.translate(
            message.guildID,
            "misc.team.yourTeamScore",
            {
                teamScore: String(
                    teamScoreboard.getTeamOfPlayer(message.author.id).getScore()
                ),
            }
        );
        footerText += "\n";
        footerText += LocalizationManager.localizer.translate(
            message.guildID,
            "misc.team.yourScore",
            { score: String(teamScoreboard.getPlayerScore(message.author.id)) }
        );
    }

    const embeds: Array<Eris.EmbedOptions> = winnersFieldSubsets.map(
        (winnersFieldSubset) => ({
            color: EMBED_SUCCESS_COLOR,
            title: LocalizationManager.localizer.translate(
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
    State.client.closeVoiceConnection(message.guildID);
}

/**
 * @param message - The Message object
 * @returns the bot's voice connection in the message's originating guild
 */
export function getVoiceConnection(
    message: Eris.Message
): Eris.VoiceConnection {
    const voiceConnection = State.client.voiceConnections.get(message.guildID);
    return voiceConnection;
}

/**
 * @param message - The Message
 * @returns whether the message's author and the bot are in the same voice channel
 */
export function areUserAndBotInSameVoiceChannel(
    message: Eris.Message
): boolean {
    const botVoiceConnection = State.client.voiceConnections.get(
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
    const member = State.client.guilds
        .get(messageContext.guildID)
        .members.get(messageContext.author.id);

    const voiceChannelID = member.voiceState.channelID;
    if (!voiceChannelID) return null;
    return State.client.getChannel(voiceChannelID) as Eris.VoiceChannel;
}

/**
 * @param voiceChannelID - The voice channel ID
 * @returns the voice channel that the message's author is in
 */
export function getVoiceChannel(voiceChannelID: string): Eris.VoiceChannel {
    const voiceChannel = State.client.getChannel(
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
            title: LocalizationManager.localizer.translate(
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
            title: LocalizationManager.localizer.translate(
                message.guildID,
                "misc.failure.vcFull.title"
            ),
            description: LocalizationManager.localizer.translate(
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
            title: LocalizationManager.localizer.translate(
                message.guildID,
                "misc.failure.afkChannel.title"
            ),
            description: LocalizationManager.localizer.translate(
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
    const voiceConnection = State.client.voiceConnections.get(guildID);
    if (!voiceConnection || !voiceConnection.channelID) return true;
    const channel = State.client.getChannel(
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
    const debugGuild = State.client.guilds.get(process.env.DEBUG_SERVER_ID);
    if (!debugGuild) return null;
    return fetchChannel(process.env.DEBUG_TEXT_CHANNEL_ID);
}

/**
 * @param guildID - The guild ID
 * @returns the number of users required for a majority
 */
export function getMajorityCount(guildID: string): number {
    const voiceChannelID =
        State.client.voiceConnections.get(guildID)?.channelID;

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
    const locale = State.getGuildLocale(guildID);
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
            )} ${LocalizationManager.localizer.translate(
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
                    LocalizationManager.localizer.translate(
                        guildID,
                        "misc.interaction.bookmarked.message.title"
                    )
                ),
                fields,
                footer: {
                    text: LocalizationManager.localizer.translate(
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
                        LocalizationManager.localizer.translate(
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
