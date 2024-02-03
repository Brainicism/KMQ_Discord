/* eslint-disable @typescript-eslint/no-use-before-define */
import * as uuid from "uuid";
import {
    BOOKMARK_COMMAND_NAME,
    EMBED_ERROR_COLOR,
    EMBED_SUCCESS_BONUS_COLOR,
    EMBED_SUCCESS_COLOR,
    EPHEMERAL_MESSAGE_FLAG,
    KmqImages,
    MAX_AUTOCOMPLETE_FIELDS,
    PERMISSIONS_LINK,
    PROFILE_COMMAND_NAME,
    SPOTIFY_BASE_URL,
    YOUTUBE_PLAYLIST_BASE_URL,
} from "../constants";
import {
    ConflictingGameOptions,
    GameOptionCommand,
    PriorityGameOption,
} from "../types";
import { IPCLogger } from "../logger";
import {
    bold,
    chooseWeightedRandom,
    chunkArray,
    clickableSlashCommand,
    containsHangul,
    delay,
    friendlyFormattedNumber,
    getOrdinalNum,
    italicize,
    parseKmqPlaylistIdentifier,
    standardDateFormat,
    strikethrough,
    truncatedString,
    underline,
} from "./utils";
import {
    getAvailableSongCount,
    getLocalizedArtistName,
    getLocalizedSongName,
    userBonusIsActive,
} from "./game_utils";
import { normalizePunctuationInName } from "../structures/game_round";
import AppCommandsAction from "../enums/app_command_action";
import EmbedPaginator from "eris-pagination";
import EnvType from "../enums/env_type";
import Eris from "eris";
import GameOption from "../enums/game_option_name";
import GameType from "../enums/game_type";
import LocaleType from "../enums/locale_type";
import MessageContext from "../structures/message_context";
import State from "../state";
import _ from "lodash";
import axios from "axios";
import dbContext from "../database_context";
import i18n from "./localization_manager";
import type { EmbedGenerator, GuildTextableMessage } from "../types";
import type { GuildTextableChannel } from "eris";
import type AutocompleteEntry from "../interfaces/autocomplete_entry";
import type BookmarkedSong from "../interfaces/bookmarked_song";
import type EmbedPayload from "../interfaces/embed_payload";
import type GameInfoMessage from "../interfaces/game_info_message";
import type GameOptions from "../interfaces/game_options";
import type GuildPreference from "../structures/guild_preference";
import type MatchedArtist from "../interfaces/matched_artist";
import type Session from "../structures/session";

const logger = new IPCLogger("discord_utils");

const REQUIRED_TEXT_PERMISSIONS = [
    "addReactions" as const,
    "embedLinks" as const,
    "attachFiles" as const,
];

const REQUIRED_VOICE_PERMISSIONS = [
    "viewChannel" as const,
    "voiceConnect" as const,
    "voiceSpeak" as const,
];

const MAX_INTERACTION_RESPONSE_TIME = 3 * 1000;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;

interface GameMessageMultiLocaleContent {
    [LocaleType.EN]: string;
    [LocaleType.KO]: string;
    [LocaleType.FR]: string;
    [LocaleType.ES]: string;
    [LocaleType.JA]: string;
    [LocaleType.ZH]: string;
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
        | Eris.AutocompleteInteraction,
): string {
    let header: string;
    if (context instanceof Eris.Message) {
        header = `gid: ${context.guildID}, uid: ${context.author.id}, tid: ${context.channel.id}`;
    } else if (
        context instanceof Eris.ComponentInteraction ||
        context instanceof Eris.CommandInteraction ||
        context instanceof Eris.AutocompleteInteraction
    ) {
        header = `gid: ${context.guildID}, uid: ${context.member?.id}, tid: ${context.channel.id}`;
    } else {
        header = `gid: ${context.guildID}, tid: ${context.textChannelID}`;
    }

    return header;
}

/**
 * @param guildID - The guild ID
 * @param missingPermissions - List of missing text permissions
 * @returns a friendly string describing the missing text permissions
 */
function missingPermissionsText(
    guildID: string,
    missingPermissions: string[],
): string {
    return i18n.translate(guildID, "misc.failure.missingPermissionsText", {
        missingPermissions: missingPermissions.join(", "),
        permissionsLink: PERMISSIONS_LINK,
        helpCommand: clickableSlashCommand("help"),
    });
}

/**
 * Fetches Users from cache, IPC, or via REST and update cache
 * @param userID - the user's ID
 * @param silentErrors - whether to log errors
 * @returns an instance of the User
 */
export async function fetchUser(
    userID: string,
    silentErrors = false,
): Promise<Eris.User | null> {
    let user: Eris.User | undefined;
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
                    `Could not fetch user: ${userID}. err: ${err.code}. msg: ${err.message}`,
                );
            return null;
        }
    }

    if (!user) {
        if (!silentErrors) logger.warn(`Could not fetch user: ${userID}`);
        return null;
    }

    // update cache
    client.users.update(user, client);
    return user;
}

/**
 * Fetches TextChannel from cache, IPC, or via REST and update cache
 * @param textChannelID - the text channel's ID
 * @returns an instance of the TextChannel
 */
export async function fetchChannel(
    textChannelID: string,
): Promise<Eris.TextChannel | null> {
    let channel: Eris.TextChannel | null = null;
    const { client, ipc } = State;

    // fetch via cache
    channel = client.getChannel(textChannelID) as Eris.TextChannel;

    // fetch via IPC from other clusters
    if (!channel) {
        logger.debug(
            `Text channel not in cache, attempting to fetch via IPC: ${textChannelID}`,
        );
        channel = await ipc.fetchChannel(textChannelID);
    }

    // fetch via REST
    if (!channel) {
        try {
            channel = (await client.getRESTChannel(
                textChannelID,
            )) as Eris.TextChannel;

            logger.debug(
                `Text channel not in cache, fetched via REST: ${textChannelID}`,
            );
        } catch (err) {
            logger.warn(
                `Could not fetch text channel: ${textChannelID}. err: ${err.code}. msg: ${err.message}`,
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
 * @param permissions - the permissions to check
 * @returns whether the bot has permissions to message's originating text channel
 */
export async function textPermissionsCheck(
    textChannelID: string,
    guildID: string,
    authorID: string,
    permissions: Array<
        keyof Eris.Constants["Permissions"]
    > = REQUIRED_TEXT_PERMISSIONS,
): Promise<boolean> {
    const messageContext = new MessageContext(textChannelID, null, guildID);
    const channel = await fetchChannel(textChannelID);
    if (!channel) return false;
    if (
        !channel
            .permissionsOf(process.env.BOT_CLIENT_ID as string)
            .has("sendMessages")
    ) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext,
            )} | Missing SEND_MESSAGES permissions`,
        );
        const embed: Eris.EmbedOptions = {
            title: i18n.translate(
                guildID,
                "misc.failure.missingPermissions.title",
            ),
            description: i18n.translate(
                guildID,
                "misc.failure.missingPermissions.description",
                {
                    channelName: `#${channel.name}`,
                    permissionsLink: PERMISSIONS_LINK,
                },
            ),
            url: PERMISSIONS_LINK,
        };

        await sendDmMessage(authorID, { embeds: [embed] });
        return false;
    }

    const missingPermissions = permissions.filter(
        (permission) =>
            !channel
                .permissionsOf(process.env.BOT_CLIENT_ID as string)
                .has(permission),
    );

    if (missingPermissions.length > 0) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext,
            )} | Missing Text Channel [${missingPermissions.join(
                ", ",
            )}] permissions`,
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
    guildID: string | undefined,
    authorID: string | undefined,
    messageContent: Eris.AdvancedMessageContent,
): Promise<void> {
    if (typeof e === "string") {
        if (e.startsWith("Request timed out")) {
            // Request Timeout
            logger.error(
                `Error sending message. Request timed out. textChannelID = ${channelID}.`,
            );
        }
    } else if (e.code) {
        const errCode = e.code;
        switch (errCode) {
            case 500: {
                // Internal Server Error
                logger.error(
                    `Error sending message. 500 Internal Server Error. textChannelID = ${channelID}.`,
                );
                break;
            }

            case 50035: {
                // Invalid Form Body
                logger.error(
                    `Error sending message. Invalid form body. textChannelID = ${channelID}. e.message = ${
                        e.message
                    }. msg_content = ${JSON.stringify(messageContent)}`,
                );
                break;
            }

            case 50001: {
                // Missing Access
                logger.warn(
                    `Error sending message. Missing Access. textChannelID = ${channelID}`,
                );
                break;
            }

            case 50013: {
                // Missing Permissions
                logger.warn(
                    `Error sending message. Missing text permissions. textChannelID = ${channelID}.`,
                );

                if (!guildID) {
                    logger.error(
                        "Unexpected null guildID in missing text permissions check",
                    );
                    break;
                }

                if (!authorID) {
                    logger.error(
                        "Unexpected null authorID in missing text permissions check",
                    );
                    break;
                }

                await textPermissionsCheck(channelID, guildID, authorID);
                break;
            }

            case 10003: {
                // Unknown channel
                logger.error(
                    `Error sending message. Unknown channel. textChannelID = ${channelID}.`,
                );
                break;
            }

            case 50007: {
                // Cannot send messages to this user
                logger.warn(
                    `Error sending message. Cannot send messages to this user. userID = ${authorID}.`,
                );
                break;
            }

            default: {
                // Unknown error code
                logger.error(
                    `Error sending message. Unknown error code ${errCode}. textChannelID = ${channelID}. msg = ${e.message}.`,
                );
                break;
            }
        }
    } else {
        logger.error(
            `Error sending message. Unknown error. textChannelID = ${channelID}. err = ${JSON.stringify(
                e,
            )}.body = ${JSON.stringify(messageContent)}`,
        );
    }
}

/**
 * A lower level message sending utility
 * and when a Eris Message object isn't available in the context
 * @param textChannelID - The channel ID where the message should be delivered
 * @param messageContent - The MessageContent to send
 * @param authorID - The author's ID
 * @param interaction - The interaction
 */
export async function sendMessage(
    textChannelID: string | null,
    messageContent: Eris.AdvancedMessageContent,
    authorID?: string,
    interaction?: Eris.ComponentInteraction | Eris.CommandInteraction,
): Promise<Eris.Message | null> {
    if (interaction) {
        if (!withinInteractionInterval(interaction)) {
            return null;
        }

        try {
            await interaction.createMessage(messageContent);
        } catch (err) {
            interactionRejectionHandler(interaction, err);
        }

        return null;
    }

    if (!textChannelID) {
        logger.error(
            `Unexpected null textChannelID in sendMessage. authorID = ${authorID}`,
        );

        return null;
    }

    const channel = await fetchChannel(textChannelID);

    // only reply to message if has required permissions
    if (
        channel &&
        !channel
            .permissionsOf(process.env.BOT_CLIENT_ID as string)
            .has("readMessageHistory")
    ) {
        if (messageContent.messageReference) {
            messageContent.messageReference = undefined;
        }
    }

    try {
        return await State.client.createMessage(textChannelID, messageContent);
    } catch (e) {
        if (!channel) {
            logger.warn(
                `Error sending message, and channel not cached. textChannelID = ${textChannelID}`,
            );
        } else {
            await sendMessageExceptionHandler(
                e,
                channel.id,
                channel.guild.id,
                authorID,
                messageContent,
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
    messageContent: Eris.AdvancedMessageContent,
): Promise<Eris.Message | null> {
    const { client } = State;
    let dmChannel: Eris.PrivateChannel;
    try {
        dmChannel = await client.getDMChannel(userID);
    } catch (e) {
        logger.warn(
            `Error sending message. Could not get DM channel. userID = ${userID}`,
        );
        return null;
    }

    try {
        return await client.createMessage(dmChannel.id, messageContent);
    } catch (e) {
        await sendMessageExceptionHandler(
            e,
            dmChannel.id,
            undefined,
            userID,
            messageContent,
        );
        return null;
    }
}

/**
 * Sends an error embed with the specified title/description
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - The embed payload
 * @param interaction - The interaction
 */
export async function sendErrorMessage(
    messageContext: MessageContext,
    embedPayload: EmbedPayload,
    interaction?: Eris.CommandInteraction,
): Promise<Eris.Message<Eris.TextableChannel> | null> {
    const author =
        embedPayload.author == null || embedPayload.author
            ? embedPayload.author
            : messageContext.author;

    if (
        embedPayload.description &&
        embedPayload.description.length > MAX_EMBED_DESCRIPTION_LENGTH
    ) {
        logger.error(
            `${getDebugLogHeader(
                messageContext,
            )} | Message was too long. description = ${
                embedPayload.description
            }`,
        );
        return sendErrorMessage(messageContext, {
            title: i18n.translate(messageContext.guildID, "misc.failure.error"),
            description: i18n.translate(
                messageContext.guildID,
                "misc.failure.messageTooLong",
            ),
        });
    }

    if (embedPayload.title.length > 256) {
        logger.error(
            `${getDebugLogHeader(
                messageContext,
            )} | Title was too long. title = ${embedPayload.title}`,
        );
        embedPayload.title = truncatedString(embedPayload.title, 256);
    }

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
                        : undefined,
                    title: embedPayload.title,
                    description: embedPayload.description,
                    footer: embedPayload.footerText
                        ? {
                              text: embedPayload.footerText,
                          }
                        : undefined,
                    thumbnail: embedPayload.thumbnailUrl
                        ? { url: embedPayload.thumbnailUrl }
                        : { url: KmqImages.DEAD },
                    url: embedPayload.url,
                },
            ],
            components: embedPayload.components,
        },
        messageContext.author.id,
        interaction,
    );
}

/**
 * Create and return a Discord embed with the specified payload
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - What to include in the message
 *  @returns a Discord embed
 */
export function generateEmbed(
    messageContext: MessageContext,
    embedPayload: EmbedPayload,
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
            : undefined,
        title: embedPayload.title,
        url: embedPayload.url,
        description: embedPayload.description,
        fields: embedPayload.fields,
        footer: embedPayload.footerText
            ? {
                  text: embedPayload.footerText,
              }
            : undefined,
        thumbnail: embedPayload.thumbnailUrl
            ? { url: embedPayload.thumbnailUrl }
            : undefined,
        timestamp: embedPayload.timestamp,
    };
}

/**
 * Sends an info embed with the specified title/description/footer text
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - What to include in the message
 * @param reply - Whether to reply to the given message
 * @param content - Plain text content
 * @param additionalEmbeds - Additional embeds to include in the message
 * @param interaction - The interaction
 */
export async function sendInfoMessage(
    messageContext: MessageContext,
    embedPayload: EmbedPayload,
    reply = false,
    content?: string,
    additionalEmbeds: Array<EmbedPayload> = [],
    interaction?: Eris.CommandInteraction,
): Promise<Eris.Message<Eris.TextableChannel> | null> {
    const embeds = [embedPayload, ...additionalEmbeds];
    for (const embed of embeds) {
        if (
            embed.description &&
            embed.description.length > MAX_EMBED_DESCRIPTION_LENGTH
        ) {
            logger.error(
                `${getDebugLogHeader(
                    messageContext,
                )} | Message was too long. description = ${embed.description}`,
            );
            return sendErrorMessage(messageContext, {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.error",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.messageTooLong",
                ),
            });
        }
    }

    for (const [i, embed] of embeds.entries()) {
        if (embed.title.length > 256) {
            logger.error(
                `${getDebugLogHeader(
                    messageContext,
                )} | Title was too long. title = ${embed.title}`,
            );
            embeds[i].title = truncatedString(embedPayload.title, 256);
        }
    }

    return sendMessage(
        messageContext.textChannelID,
        {
            embeds: embeds.map((x) => generateEmbed(messageContext, x)),
            messageReference:
                reply && messageContext.referencedMessageID
                    ? {
                          messageID: messageContext.referencedMessageID,
                          failIfNotExists: false,
                      }
                    : undefined,
            components: embedPayload.components,
            content: content || undefined,
        },
        messageContext.author.id,
        interaction,
    );
}

/**
 * Get a sentence describing the current limit
 * @param guildID - The ID of the guild where the limit is sent
 * @param gameOptions - The game options
 * @param count - The song count after limit
 * @param countBeforeLimit - The song count before limit
 *  @returns a string describing the limit
 */
function getFormattedLimit(
    guildID: string,
    gameOptions: GameOptions,
    count: number,
    countBeforeLimit: number,
): string {
    const visibleLimitEnd = Math.min(countBeforeLimit, gameOptions.limitEnd);

    const visibleLimitStart = Math.min(
        countBeforeLimit,
        gameOptions.limitStart,
    );

    if (gameOptions.limitStart === 0) {
        return friendlyFormattedNumber(visibleLimitEnd);
    }

    return i18n.translate(guildID, "misc.formattedLimit", {
        limitStart: getOrdinalNum(visibleLimitStart),
        limitEnd: getOrdinalNum(visibleLimitEnd),
        songCount: friendlyFormattedNumber(count),
    });
}

/**
 * Creates an embed displaying the currently selected GameOptions
 * @param session - The session
 * @param messageContext - The Message Context
 * @param guildPreference - The corresponding GuildPreference
 * @param updatedOptions - The GameOptions which were modified
 * @param preset - Specifies whether the GameOptions were modified by a preset
 * @param allReset - Specifies whether all GameOptions were reset
 * @param footerText - The footer text
 * @param interaction - The interaction
 *  @returns an embed of current game options
 */
export async function generateOptionsMessage(
    session: Session,
    messageContext: MessageContext,
    guildPreference: GuildPreference,
    updatedOptions: { option: GameOption; reset: boolean }[],
    preset = false,
    allReset = false,
    footerText?: string,
    interaction?: Eris.CommandInteraction,
): Promise<EmbedPayload | null> {
    if (guildPreference.gameOptions.forcePlaySongID) {
        return {
            title: "[DEBUG] Force Play Mode Active",
            description: `Force playing video ID: ${guildPreference.gameOptions.forcePlaySongID}`,
            footerText,
            thumbnailUrl: KmqImages.READING_BOOK,
        };
    }

    const guildID = messageContext.guildID;

    // Store the VALUE of ,[option]: [VALUE] into optionStrings
    // Null optionStrings values are set to "Not set" below
    const optionStrings: { [option: string]: string | null } = {};

    const gameOptions = guildPreference.gameOptions;
    const kmqPlaylistIdentifier = gameOptions.kmqPlaylistIdentifier;
    let thumbnailUrl: string | undefined;

    if (kmqPlaylistIdentifier) {
        const matchedPlaylistMetadata =
            await State.playlistManager.getMatchedPlaylistMetadata(
                guildID,
                kmqPlaylistIdentifier,
                false,
                messageContext,
                interaction,
            );

        const kmqPlaylistParsed = parseKmqPlaylistIdentifier(
            kmqPlaylistIdentifier,
        );

        const playlistUrl = `${
            kmqPlaylistParsed.isSpotify
                ? SPOTIFY_BASE_URL
                : YOUTUBE_PLAYLIST_BASE_URL
        }${kmqPlaylistParsed.playlistId}`;

        optionStrings[GameOption.PLAYLIST_ID] =
            `[${matchedPlaylistMetadata.playlistName}](${playlistUrl})`;

        thumbnailUrl = matchedPlaylistMetadata.thumbnailUrl ?? undefined;
    } else {
        optionStrings[GameOption.PLAYLIST_ID] = null;
    }

    const totalSongs = await getAvailableSongCount(
        guildPreference,
        messageContext,
        interaction,
    );

    if (
        totalSongs.count === undefined ||
        totalSongs.countBeforeLimit === undefined
    ) {
        await sendErrorMessage(messageContext, {
            title: i18n.translate(
                guildID,
                "misc.failure.retrievingSongData.title",
            ),
            description: i18n.translate(
                guildID,
                "misc.failure.retrievingSongData.description",
                { helpCommand: clickableSlashCommand("help") },
            ),
        });
        return null;
    }

    const limit = getFormattedLimit(
        guildID,
        gameOptions,
        totalSongs.count,
        totalSongs.countBeforeLimit,
    );

    optionStrings[GameOption.LIMIT] = `${limit} / ${friendlyFormattedNumber(
        totalSongs.countBeforeLimit,
    )}`;

    optionStrings[GameOption.GROUPS] = guildPreference.isGroupsMode()
        ? guildPreference.getDisplayedGroupNames()
        : null;
    optionStrings[GameOption.GENDER] = gameOptions.gender.join(", ");
    optionStrings[GameOption.CUTOFF] =
        `${gameOptions.beginningYear} - ${gameOptions.endYear}`;
    optionStrings[GameOption.ARTIST_TYPE] = gameOptions.artistType;
    optionStrings[GameOption.ANSWER_TYPE] = gameOptions.answerType;
    optionStrings[GameOption.RELEASE_TYPE] = gameOptions.releaseType;
    optionStrings[GameOption.LANGUAGE_TYPE] = gameOptions.languageType;
    optionStrings[GameOption.SUBUNIT_PREFERENCE] =
        gameOptions.subunitPreference;
    optionStrings[GameOption.OST_PREFERENCE] = gameOptions.ostPreference;
    optionStrings[GameOption.REMIX_PREFERENCE] = gameOptions.remixPreference;
    optionStrings[GameOption.MULTIGUESS] = gameOptions.multiGuessType;
    optionStrings[GameOption.SHUFFLE_TYPE] = gameOptions.shuffleType;
    optionStrings[GameOption.SEEK_TYPE] = gameOptions.seekType;
    optionStrings[GameOption.GUESS_MODE_TYPE] = gameOptions.guessModeType;
    optionStrings[GameOption.SPECIAL_TYPE] = gameOptions.specialType;

    optionStrings[GameOption.TIMER] = guildPreference.isGuessTimeoutSet()
        ? i18n.translate(guildID, "command.options.timer", {
              timerInSeconds: String(gameOptions.guessTimeout),
          })
        : null;

    optionStrings[GameOption.DURATION] = guildPreference.isDurationSet()
        ? i18n.translate(guildID, "command.options.duration", {
              durationInMinutes: String(gameOptions.duration),
          })
        : null;

    optionStrings[GameOption.EXCLUDE] = guildPreference.isExcludesMode()
        ? guildPreference.getDisplayedExcludesGroupNames()
        : null;

    optionStrings[GameOption.INCLUDE] = guildPreference.isIncludesMode()
        ? guildPreference.getDisplayedIncludesGroupNames()
        : null;

    const conflictString = i18n.translate(guildID, "misc.conflict");

    const generateConflictingCommandEntry = (
        commandValue: string,
        conflictingOption: string,
    ): string =>
        `${strikethrough(commandValue)} (\`/${conflictingOption}\` ${italicize(
            conflictString,
        )})`;

    const isEliminationMode =
        session?.isGameSession() && session.gameType === GameType.ELIMINATION;

    // Special case: goal is conflicting only when current game is elimination
    if (guildPreference.isGoalSet()) {
        optionStrings[GameOption.GOAL] = String(gameOptions.goal);
        if (isEliminationMode) {
            optionStrings[GameOption.GOAL] = generateConflictingCommandEntry(
                optionStrings[GameOption.GOAL] as string,
                `play ${GameType.ELIMINATION}`,
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
                const optionString = optionStrings[option];
                if (optionString && !optionString.includes(conflictString)) {
                    optionStrings[option] = generateConflictingCommandEntry(
                        optionString,
                        GameOptionCommand[gameOptionConflictCheck.gameOption],
                    );
                }
            }
        }
    }

    for (const option of Object.values(GameOption)) {
        optionStrings[option] =
            optionStrings[option] ||
            italicize(i18n.translate(guildID, "command.options.notSet"));
    }

    // Underline changed option
    if (updatedOptions.length > 0) {
        for (const updatedOption of updatedOptions) {
            const optionString = optionStrings[updatedOption.option];
            if (optionString) {
                optionStrings[updatedOption.option] = underline(optionString);
            }
        }
    }

    // Special case: disable these options in a listening session
    if (session?.isListeningSession()) {
        const disabledOptions = [
            GameOption.GUESS_MODE_TYPE,
            GameOption.SEEK_TYPE,
            GameOption.MULTIGUESS,
            GameOption.ANSWER_TYPE,
            GameOption.GOAL,
            GameOption.TIMER,
        ];

        for (const option of disabledOptions) {
            optionStrings[option] = null;
        }
    }

    // Special case: Options that rely on modifying queried songs are disabled when playing from KMQ playlist
    const isPlaylist = guildPreference.isPlaylist();
    if (isPlaylist) {
        const disabledOptions = [
            GameOption.LIMIT,
            GameOption.GROUPS,
            GameOption.GENDER,
            GameOption.CUTOFF,
            GameOption.ARTIST_TYPE,
            GameOption.RELEASE_TYPE,
            GameOption.LANGUAGE_TYPE,
            GameOption.SUBUNIT_PREFERENCE,
            GameOption.OST_PREFERENCE,
            GameOption.REMIX_PREFERENCE,
            GameOption.EXCLUDE,
            GameOption.INCLUDE,
        ];

        for (const option of disabledOptions) {
            optionStrings[option] = null;
        }
    }

    let optionsOverview: string;
    if (!isPlaylist) {
        optionsOverview = i18n.translate(
            messageContext.guildID,
            "command.options.overview",
            {
                limit: bold(limit),
                totalSongs: bold(
                    friendlyFormattedNumber(totalSongs.countBeforeLimit),
                ),
            },
        );
    } else {
        const kmqPlaylistParsed = parseKmqPlaylistIdentifier(
            guildPreference.getKmqPlaylistID() as string,
        );

        optionsOverview = i18n.translate(
            messageContext.guildID,
            kmqPlaylistParsed.isSpotify
                ? "command.options.spotify"
                : "command.options.youtube",
            {
                songCount: bold(limit),
            },
        );
    }

    // Options excluded from embed fields since they are of higher importance (shown above them as part of the embed description)
    let priorityOptions: string;
    priorityOptions = PriorityGameOption.filter(
        (option) => optionStrings[option],
    )
        .map(
            (option) =>
                `${clickableSlashCommand(GameOptionCommand[option])}: ${
                    optionStrings[option]
                }`,
        )
        .join("\n");

    const fieldOptions = Object.keys(GameOptionCommand)
        .filter((option) => optionStrings[option as GameOption])
        .filter((option) => !PriorityGameOption.includes(option as GameOption));

    // Remove priority options; emplace /playlist / /answer at the start of options
    if (isPlaylist) {
        priorityOptions = "";
        if (!session?.isListeningSession()) {
            fieldOptions.unshift(GameOption.ANSWER_TYPE);
        }

        fieldOptions.unshift(GameOption.PLAYLIST_ID);
    }

    // Split non-priority options into three fields
    let firstNonPriorityOptions = fieldOptions
        .slice(0, Math.ceil(fieldOptions.length / 3))
        .map(
            (option) =>
                `${clickableSlashCommand(GameOptionCommand[option])}: ${
                    optionStrings[option]
                }`,
        )
        .join("\n");

    firstNonPriorityOptions += "\n\n";
    firstNonPriorityOptions += clickableSlashCommand("preset", "save");

    let secondNonPriorityOptions = fieldOptions
        .slice(
            Math.ceil(fieldOptions.length / 3),
            Math.ceil((2 * fieldOptions.length) / 3),
        )
        .map(
            (option) =>
                `${clickableSlashCommand(GameOptionCommand[option])}: ${
                    optionStrings[option]
                }`,
        )
        .join("\n");

    secondNonPriorityOptions += "\n\n";
    secondNonPriorityOptions += clickableSlashCommand("preset", "load");

    let thirdNonPriorityOptions = fieldOptions
        .slice(Math.ceil((2 * fieldOptions.length) / 3))
        .map(
            (option) =>
                `${clickableSlashCommand(GameOptionCommand[option])}: ${
                    optionStrings[option]
                }`,
        )
        .join("\n");

    thirdNonPriorityOptions += "\n\n";
    thirdNonPriorityOptions += clickableSlashCommand("reset");

    const ZERO_WIDTH_SPACE = "​";

    const fields = [
        {
            name: ZERO_WIDTH_SPACE,
            value: firstNonPriorityOptions,
            inline: true,
        },
        {
            name: ZERO_WIDTH_SPACE,
            value: secondNonPriorityOptions,
            inline: true,
        },
        {
            name: ZERO_WIDTH_SPACE,
            value: thirdNonPriorityOptions,
            inline: true,
        },
    ];

    if (
        updatedOptions.length > 0 &&
        !allReset &&
        updatedOptions[0] &&
        updatedOptions[0].reset
    ) {
        footerText = i18n.translate(
            messageContext.guildID,
            "command.options.perCommandHelp",
            { helpCommand: "/help" },
        );
    } else if (session?.isListeningSession()) {
        footerText = i18n.translate(
            messageContext.guildID,
            "command.options.listeningSessionNotAvailable",
        );
    }

    let title = "";
    if (updatedOptions.length === 0 || allReset) {
        title = i18n.translate(messageContext.guildID, "command.options.title");
    } else {
        if (preset) {
            title = i18n.translate(
                messageContext.guildID,
                "command.options.preset",
            );
        } else {
            title = updatedOptions[0].option;
        }

        title =
            updatedOptions[0] && updatedOptions[0].reset
                ? i18n.translate(
                      messageContext.guildID,
                      "command.options.reset",
                      { presetOrOption: title },
                  )
                : i18n.translate(
                      messageContext.guildID,
                      "command.options.updated",
                      { presetOrOption: title },
                  );
    }

    let description = "";

    description += optionsOverview;
    description += "\n\n";
    description += priorityOptions;

    return {
        title,
        description,
        fields,
        footerText,
        thumbnailUrl,
    };
}

/**
 * Sends an embed displaying the currently selected GameOptions
 * @param session - The session
 * @param messageContext - The Message Context
 * @param guildPreference - The corresponding GuildPreference
 * @param updatedOptions - The GameOptions which were modified
 * @param preset - Specifies whether the GameOptions were modified by a preset
 * @param allReset - Specifies whether all GameOptions were reset
 * @param footerText - The footer text
 * @param interaction - The interaction
 */
export async function sendOptionsMessage(
    session: Session,
    messageContext: MessageContext,
    guildPreference: GuildPreference,
    updatedOptions: { option: GameOption; reset: boolean }[],
    preset = false,
    allReset = false,
    footerText?: string,
    interaction?: Eris.CommandInteraction,
): Promise<void> {
    const optionsEmbed = await generateOptionsMessage(
        session,
        messageContext,
        guildPreference,
        updatedOptions,
        preset,
        allReset,
        footerText,
        interaction,
    );

    if (!optionsEmbed) {
        logger.error(
            `${getDebugLogHeader(
                messageContext,
            )} | Unexpectedly unable to generate options embed in sendOptionsMessage. session = ${!!session}. updatedOptions = ${JSON.stringify(
                updatedOptions,
            )}. preset = ${preset}. allReset = ${allReset}. interaction = ${!!interaction}`,
        );
        if (interaction && !interaction.acknowledged) {
            await interaction.acknowledge();
        }

        return;
    }

    if (interaction?.acknowledged) {
        await interaction.createFollowup({
            embeds: [generateEmbed(messageContext, optionsEmbed)],
        });
    } else {
        await sendInfoMessage(
            messageContext,
            optionsEmbed,
            true,
            undefined,
            [],
            interaction,
        );
    }
}

/**
 * @param guildID - The guildID
 * @returns a random GameInfoMessage
 */
export async function getGameInfoMessage(
    guildID: string,
): Promise<GameInfoMessage | null> {
    const endGameMessage: GameInfoMessage = chooseWeightedRandom(
        await dbContext.kmq
            .selectFrom("game_messages")
            .select(["title", "message", "weight"])
            .execute(),
    );

    if (!endGameMessage) return null;

    const locale = State.getGuildLocale(guildID);
    try {
        const gameInfoMessageContent: GameMessageMultiLocaleContent =
            JSON.parse(endGameMessage.message);

        if (Object.values(gameInfoMessageContent).some((v) => !v)) {
            logger.error(
                `Message's Game info message content is missing content. ${gameInfoMessageContent}`,
            );
            return null;
        }

        endGameMessage.message = gameInfoMessageContent[locale];

        if (!endGameMessage.message) {
            endGameMessage.message = gameInfoMessageContent.en;
        }
    } catch (e) {
        logger.error(
            `Error parsing message's game info message content, invalid JSON? message = ${endGameMessage.message}`,
        );
    }

    try {
        const gameInfoMessageContent: GameMessageMultiLocaleContent =
            JSON.parse(endGameMessage.title);

        if (Object.values(gameInfoMessageContent).some((v) => !v)) {
            logger.error(
                `Title's game info message content is missing content. ${gameInfoMessageContent}`,
            );
            return null;
        }

        endGameMessage.title = gameInfoMessageContent[locale];

        if (!endGameMessage.title) {
            endGameMessage.title = gameInfoMessageContent.en;
        }
    } catch (e) {
        logger.error(
            `Error parsing title's game info message content, invalid JSON? title = ${endGameMessage.title}`,
        );
    }

    return endGameMessage;
}

/**
 * Sends a paginated embed
 * @param messageOrInteraction - The Message object
 * @param embeds - A list of embeds to paginate over
 * @param components - A list of components to add to the embed
 * @param startPage - The page to start on
 */
export async function sendPaginationedEmbed(
    messageOrInteraction: GuildTextableMessage | Eris.CommandInteraction,
    embeds: Array<Eris.EmbedOptions> | Array<EmbedGenerator>,
    components?: Array<Eris.ActionRow>,
    startPage = 1,
): Promise<Eris.Message | null> {
    if (embeds.length > 1) {
        if (
            await textPermissionsCheck(
                messageOrInteraction.channel.id,
                messageOrInteraction.guildID as string,
                messageOrInteraction.member!.id,
                [...REQUIRED_TEXT_PERMISSIONS, "readMessageHistory"],
            )
        ) {
            return EmbedPaginator.createPaginationEmbed(
                messageOrInteraction.channel as GuildTextableChannel,
                messageOrInteraction.member!.id,
                embeds,
                { timeout: 60000, startPage, cycling: true },
                components,
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : undefined,
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
        messageOrInteraction.channel.id,
        { embeds: [embed], components },
        messageOrInteraction.member?.id,
        messageOrInteraction instanceof Eris.CommandInteraction
            ? messageOrInteraction
            : undefined,
    );
}

/**
 * Disconnects the bot from the voice channel of the  message's originating guild
 * @param message - The Message object
 */
export function disconnectVoiceConnection(message: GuildTextableMessage): void {
    State.client.closeVoiceConnection(message.guildID);
}

/**
 * @param userID - the user's ID
 * @param guildID - the guild ID
 * @returns whether the message's author and the bot are in the same voice channel
 */
export function areUserAndBotInSameVoiceChannel(
    userID: string,
    guildID: string,
): boolean {
    const member = State.client.guilds.get(guildID)?.members.get(userID);
    const botVoiceConnection = State.client.voiceConnections.get(guildID);

    if (!member || !member.voiceState || !botVoiceConnection) {
        return false;
    }

    return member.voiceState.channelID === botVoiceConnection.channelID;
}

/**
 * @param messageContext - The messageContext object
 * @returns the voice channel that the message's author is in
 */
export function getUserVoiceChannel(
    messageContext: MessageContext,
): Eris.VoiceChannel | null {
    const member = State.client.guilds
        .get(messageContext.guildID)
        ?.members.get(messageContext.author.id);

    if (!member) return null;

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
        voiceChannelID,
    ) as Eris.VoiceChannel;

    return voiceChannel;
}

/**
 * @param voiceChannelID - The voice channel to check
 * @returns the users in the voice channel, excluding bots
 */
export function getCurrentVoiceMembers(
    voiceChannelID: string,
): Array<Eris.Member> {
    const voiceChannel = getVoiceChannel(voiceChannelID);
    if (!voiceChannel) {
        logger.warn(`Voice channel not in cache: ${voiceChannelID}`);
        return [];
    }

    return voiceChannel.voiceMembers
        .filter((x) => !x.bot)
        .filter((x) => !State.bannedPlayers.has(x.id));
}

/**
 * @param voiceChannelID - The voice channel to check
 * @returns the number of persons in the voice channel, excluding bots
 */
export function getNumParticipants(voiceChannelID: string): number {
    return getCurrentVoiceMembers(voiceChannelID).length;
}

/**
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param interaction - The interaction
 * @returns whether the bot has permissions to join the message author's currently active voice channel
 */
export function voicePermissionsCheck(
    messageContext: MessageContext,
    interaction?: Eris.CommandInteraction,
): boolean {
    const voiceChannel = getUserVoiceChannel(messageContext);

    if (!voiceChannel) {
        logger.error("Voice channel unexpectedly null");
        return false;
    }

    const missingPermissions = REQUIRED_VOICE_PERMISSIONS.filter(
        (permission) =>
            !voiceChannel
                .permissionsOf(process.env.BOT_CLIENT_ID as string)
                .has(permission),
    );

    if (missingPermissions.length > 0) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext,
            )} | Missing Voice Channel [${missingPermissions.join(
                ", ",
            )}] permissions`,
        );

        sendErrorMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.missingPermissions.title",
                ),
                description: missingPermissionsText(
                    messageContext.guildID,
                    missingPermissions,
                ),
                url: PERMISSIONS_LINK,
            },
            interaction,
        );
        return false;
    }

    const channelFull =
        voiceChannel.userLimit &&
        voiceChannel.voiceMembers.size >= voiceChannel.userLimit;

    if (channelFull) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Channel full`);
        sendInfoMessage(messageContext, {
            title: i18n.translate(
                messageContext.guildID,
                "misc.failure.vcFull.title",
            ),
            description: i18n.translate(
                messageContext.guildID,
                "misc.failure.vcFull.description",
            ),
        });
        return false;
    }

    const afkChannel = voiceChannel.id === voiceChannel.guild.afkChannelID;
    if (afkChannel) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext,
            )} | Attempted to start game in AFK voice channel`,
        );

        sendInfoMessage(messageContext, {
            title: i18n.translate(
                messageContext.guildID,
                "misc.failure.afkChannel.title",
            ),
            description: i18n.translate(
                messageContext.guildID,
                "misc.failure.afkChannel.description",
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
        voiceConnection.channelID,
    ) as Eris.VoiceChannel;

    if (channel.voiceMembers.size === 0) return true;
    if (
        channel.voiceMembers.size === 1 &&
        channel.voiceMembers.has(process.env.BOT_CLIENT_ID as string)
    ) {
        return true;
    }

    return false;
}

/** @returns the debug TextChannel */
export function getDebugChannel(): Promise<Eris.TextChannel | null> {
    if (!process.env.DEBUG_SERVER_ID || !process.env.DEBUG_TEXT_CHANNEL_ID)
        return Promise.resolve(null);
    const debugGuild = State.client.guilds.get(process.env.DEBUG_SERVER_ID);
    if (!debugGuild) return Promise.resolve(null);
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
export async function sendDebugAlertWebhook(
    title: string,
    description: string,
    color: number,
    avatarUrl: string,
): Promise<void> {
    if (!process.env.ALERT_WEBHOOK_URL) return;
    await axios.post(process.env.ALERT_WEBHOOK_URL, {
        embeds: [
            {
                title,
                description,
                color,
            },
        ],
        username: "Kimiqo",
        avatar_url: avatarUrl,
        footerText: State.version,
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
        [userID: string]: Map<string, BookmarkedSong>;
    },
): Promise<void> {
    const locale = State.getGuildLocale(guildID);
    for (const [userID, songs] of Object.entries(bookmarkedSongs)) {
        const allEmbedFields: Array<{
            name: string;
            value: string;
            inline: boolean;
        }> = [...songs].map((bookmarkedSong) => ({
            name: `${bold(
                truncatedString(
                    `"${getLocalizedSongName(
                        bookmarkedSong[1].song,
                        locale,
                    )}" - ${getLocalizedArtistName(
                        bookmarkedSong[1].song,
                        locale,
                    )}`,
                    256,
                ),
            )} (${standardDateFormat(bookmarkedSong[1].song.publishDate)})`,
            value: `[${friendlyFormattedNumber(
                bookmarkedSong[1].song.views,
            )} ${i18n.translate(guildID, "misc.views")}](https://youtu.be/${
                bookmarkedSong[1].song.youtubeLink
            })`,
            inline: false,
        }));

        for (const fields of chunkArray(allEmbedFields, 25)) {
            const embed: Eris.EmbedOptions = {
                author: {
                    name: "Kimiqo",
                    icon_url: KmqImages.READING_BOOK,
                },
                title: i18n.translate(
                    guildID,
                    "misc.interaction.bookmarked.message.title",
                ),
                fields,
                footer: {
                    text: i18n.translate(
                        guildID,
                        "misc.interaction.bookmarked.message.playedOn",
                        { date: standardDateFormat(new Date()) },
                    ),
                },
            };

            // eslint-disable-next-line no-await-in-loop
            await sendDmMessage(userID, { embeds: [embed] });
            // eslint-disable-next-line no-await-in-loop
            await delay(1000);
        }
    }
}

function withinInteractionInterval(
    interaction:
        | Eris.ComponentInteraction
        | Eris.CommandInteraction
        | Eris.AutocompleteInteraction,
): boolean {
    return (
        new Date().getTime() - interaction.createdAt <=
        MAX_INTERACTION_RESPONSE_TIME
    );
}

function interactionRejectionHandler(
    interaction:
        | Eris.ComponentInteraction
        | Eris.CommandInteraction
        | Eris.AutocompleteInteraction,
    err: Error & { code: number },
): void {
    if (err.code === 10062) {
        logger.warn(
            `${getDebugLogHeader(
                interaction,
            )} | Interaction acknowledge (unknown interaction)`,
        );
    } else {
        logger.error(
            `${getDebugLogHeader(
                interaction,
            )} | Interaction acknowledge (failure message) failed. err.code = ${
                err.code
            } err = ${JSON.stringify(err)}`,
        );
    }
}

/**
 * Attempts to acknowledge an interaction
 * @param interaction - The originating interaction
 */
export async function tryInteractionAcknowledge(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction,
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
 * Attempts to acknowledge an autocomplete interaction with the given response data
 * @param interaction - The originating interaction
 * @param response - The autocomplete data to show the user
 */
export async function tryAutocompleteInteractionAcknowledge(
    interaction: Eris.AutocompleteInteraction,
    response: Array<{ name: string; value: string }>,
): Promise<void> {
    if (!withinInteractionInterval(interaction)) {
        return;
    }

    try {
        await interaction.acknowledge(response);
    } catch (err) {
        interactionRejectionHandler(interaction, err);
    }
}

/**
 * Attempts to send a success response to an interaction
 * @param interaction - The originating interaction
 * @param title - The embed title
 * @param description - The embed description
 * @param ephemeral - Whether the embed can only be seen by the triggering user
 */
export async function tryCreateInteractionSuccessAcknowledgement(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction,
    title: string,
    description: string,
    ephemeral: boolean = false,
): Promise<void> {
    await sendMessage(
        null,
        {
            embeds: [
                {
                    color: (await userBonusIsActive(
                        interaction.member?.id as string,
                    ))
                        ? EMBED_SUCCESS_BONUS_COLOR
                        : EMBED_SUCCESS_COLOR,
                    author: {
                        name: interaction.member!.username,
                        icon_url: interaction.member?.avatarURL,
                    },
                    title,
                    description,
                    thumbnail: { url: KmqImages.THUMBS_UP },
                },
            ],
            flags: ephemeral ? EPHEMERAL_MESSAGE_FLAG : undefined,
        },
        undefined,
        interaction,
    );
}

/**
 * Attempts to send a error message to an interaction
 * @param interaction - The originating interaction
 * @param title - The embed title
 * @param description - The embed description
 * @param ephemeral - Whether the embed can only be seen by the triggering user
 */
export async function tryCreateInteractionErrorAcknowledgement(
    interaction: Eris.ComponentInteraction | Eris.CommandInteraction,
    title: string | null,
    description: string,
    ephemeral: boolean = true,
): Promise<void> {
    await sendMessage(
        null,
        {
            embeds: [
                {
                    color: EMBED_ERROR_COLOR,
                    author: interaction.member && {
                        name: interaction.member.username,
                        icon_url: interaction.member.avatarURL,
                    },
                    title:
                        title ||
                        i18n.translate(
                            interaction.guildID as string,
                            "misc.interaction.title.failure",
                        ),
                    description,
                    thumbnail: { url: KmqImages.DEAD },
                },
            ],
            flags: ephemeral ? EPHEMERAL_MESSAGE_FLAG : undefined,
        },
        undefined,
        interaction,
    );
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
        new MessageContext(
            process.env.POWER_HOUR_NOTIFICATION_CHANNEL_ID,
            null,
            "",
        ),
        {
            title: "⬆️ KMQ Power Hour Starts Now! ⬆️",
            description: "Earn 2x EXP for the next hour!",
            thumbnailUrl: KmqImages.LISTENING,
        },
        false,
        `<@&${process.env.POWER_HOUR_NOTIFICATION_ROLE_ID}>`,
    );
}

/**
 * @param interaction - The interaction
 * @returns the interaction key and value
 */
export function getInteractionValue(
    interaction: Eris.CommandInteraction | Eris.AutocompleteInteraction,
): {
    interactionKey: string | null;
    interactionOptions: {
        [optionName: string]: any;
    };
    interactionName: string | null;
    focusedKey: string | null;
} {
    let options = interaction.data.options as Eris.InteractionDataOptions[];

    if (options == null) {
        return {
            interactionKey: null,
            interactionOptions: {},
            interactionName: null,
            focusedKey: null,
        };
    }

    let parentInteractionDataName: string | null = null;
    const keys: Array<string> = [];
    while (options.length > 0) {
        keys.push(options[0].name);
        if (
            options[0].type ===
                Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND ||
            options[0].type ===
                Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
        ) {
            parentInteractionDataName = options[0].name;
            const newOptions = options[0].options;
            if (!newOptions) break;

            options = newOptions;
        } else {
            break;
        }
    }

    return {
        interactionKey: keys.join("."),
        interactionOptions: (
            options as Eris.InteractionDataOptionsWithValue[]
        ).reduce(
            (result, filter: Eris.InteractionDataOptionsWithValue) => {
                result[filter.name] = filter.value;
                return result;
            },
            {} as { [name: string]: string | number | boolean },
        ),
        interactionName: parentInteractionDataName,
        focusedKey: options.find((x) => x["focused"])?.name ?? null,
    };
}

/**
 * Retrieve artist names from the interaction options
 * @param enteredNames - Artist names the user has entered
 * @returns the matched artists
 */
export function getMatchedArtists(enteredNames: Array<string>): {
    matchedGroups: Array<MatchedArtist>;
    unmatchedGroups: Array<string>;
} {
    const matchedGroups: Array<MatchedArtist> = [];
    const unmatchedGroups: Array<string> = [];
    for (const artistName of enteredNames) {
        const match =
            State.artistToEntry[normalizePunctuationInName(artistName)];

        if (match) {
            matchedGroups.push(match);
        } else {
            unmatchedGroups.push(artistName);
        }
    }

    return {
        matchedGroups: _.uniqBy(matchedGroups, "id"),
        unmatchedGroups,
    };
}

/**
 * Get artists that match the given query, or top artists if no query is provided
 * @param lowercaseUserInput - The user's input, in lowercase
 * @param excludedArtistNames - Artists to exclude in the result
 * @returns a list of group names
 */
export function searchArtists(
    lowercaseUserInput: string,
    excludedArtistNames: Array<string>,
): Array<MatchedArtist> {
    if (lowercaseUserInput === "") {
        return Object.values(State.topArtists).filter(
            (x) => !excludedArtistNames.includes(x.name),
        );
    }

    return Object.entries(State.artistToEntry)
        .filter((x) => x[0].startsWith(lowercaseUserInput))
        .sort((a, b) => a[0].localeCompare(b[0]))
        .filter((x) => !excludedArtistNames.includes(x[1].name))
        .map((x) => x[1]);
}

/**
 * Transform the given data into autocomplete format
 * @param data - Data to include in the result
 * @param showHangul - Whether to use hangul
 * @returns a list of group names
 */
export function localizedAutocompleteFormat(
    data: Array<{ name: string; hangulName?: string | null }>,
    showHangul: boolean,
): Array<AutocompleteEntry> {
    return data
        .map((x) => ({
            name: showHangul && x.hangulName ? x.hangulName : x.name,
            value: showHangul && x.hangulName ? x.hangulName : x.name,
        }))
        .slice(0, MAX_AUTOCOMPLETE_FIELDS);
}

/**
 * Handles showing suggested artists as the user types for the groups/include/exclude slash commands
 * @param interaction - The interaction with intermediate typing state
 */
export async function processGroupAutocompleteInteraction(
    interaction: Eris.AutocompleteInteraction,
): Promise<void> {
    const interactionData = getInteractionValue(interaction);
    const focusedKey = interactionData.focusedKey;

    if (focusedKey === null) {
        logger.error(
            "focusedKey unexpectedly null in processGroupAutocompleteInteraction",
        );

        return;
    }

    const focusedVal = interactionData.interactionOptions[focusedKey];
    const lowercaseUserInput = normalizePunctuationInName(focusedVal);

    const previouslyEnteredArtists = getMatchedArtists(
        Object.entries(interactionData.interactionOptions)
            .filter((x) => x[0] !== focusedKey)
            .map((x) => x[1]),
    ).matchedGroups.map((x) => x.name);

    const showHangul =
        containsHangul(lowercaseUserInput) ||
        State.getGuildLocale(interaction.guildID as string) === LocaleType.KO;

    await tryAutocompleteInteractionAcknowledge(
        interaction,
        localizedAutocompleteFormat(
            searchArtists(lowercaseUserInput, previouslyEnteredArtists),
            showHangul,
        ),
    );
}

/**
 * @param userID - The user ID
 * @returns - The user's tag
 */
export async function getUserTag(userID: string): Promise<string> {
    const member = await fetchUser(userID);
    if (!member) {
        return "";
    }

    // remove once username migration is complete
    if (member.discriminator !== "0") {
        return `${member.username}#${member.discriminator}`;
    }

    return member.username;
}

/**
 * @param messageContext - the messager context
 */
export async function sendDeprecatedTextCommandMessage(
    messageContext: MessageContext,
): Promise<Eris.Message<Eris.TextableChannel> | null> {
    return sendErrorMessage(messageContext, {
        title: i18n.translate(
            messageContext.guildID,
            "misc.failure.deprecatedTextCommand.title",
        ),
        description: i18n.translate(
            messageContext.guildID,
            "misc.failure.deprecatedTextCommand.description",
        ),
    });
}

/**
 * Fetches slash command names associated with their Discord IDs
 * @returns a map of app command names to their IDs
 */
export const fetchAppCommandIDs = async (): Promise<{
    [commandName: string]: string;
}> => {
    let commands: Eris.AnyApplicationCommand[];
    if (process.env.NODE_ENV === EnvType.PROD) {
        commands = await State.client.getCommands();
    } else {
        commands = process.env.DEBUG_SERVER_ID
            ? await State.client.getGuildCommands(
                  process.env.DEBUG_SERVER_ID as string,
              )
            : [];
    }

    const commandToID: { [commandName: string]: string } = {};
    for (const command of commands) {
        commandToID[command.name] = command.id;
    }

    return commandToID;
};

/**
 * Updates the Discord slash commands
 * @param appCommandType - Whether to reload or delete app commands
 */
export const updateAppCommands = async (
    appCommandType = AppCommandsAction.RELOAD,
): Promise<void> => {
    const isProd = process.env.NODE_ENV === EnvType.PROD;

    let commandStructures: Eris.ApplicationCommandStructure[] = [];

    if (appCommandType === AppCommandsAction.RELOAD) {
        commandStructures = [
            {
                name: BOOKMARK_COMMAND_NAME,
                type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
            },
            {
                name: PROFILE_COMMAND_NAME,
                type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
            },
            {
                name: PROFILE_COMMAND_NAME,
                type: Eris.Constants.ApplicationCommandTypes.USER,
            },
        ];

        for (const commandObj of Object.entries(State.client.commands)) {
            const commandName = commandObj[0];
            const command = commandObj[1];
            if (command.slashCommands) {
                const commands =
                    command.slashCommands() as Array<Eris.ChatInputApplicationCommandStructure>;

                for (const cmd of commands) {
                    cmd.nameLocalizations =
                        cmd.nameLocalizations ??
                        Object.values(LocaleType)
                            .filter((x) => x !== LocaleType.EN)
                            .reduce(
                                (acc, locale) => ({
                                    ...acc,
                                    [locale]: i18n.translate(
                                        locale,
                                        `command.${commandName}.help.name`,
                                    ),
                                }),
                                {},
                            );
                    if (
                        cmd.type ===
                        Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
                    ) {
                        if (!cmd.description) {
                            let translationKey = `command.${commandName}.help.interaction.description`;
                            const fallbackTranslationKey = `command.${commandName}.help.description`;
                            if (!i18n.hasKey(translationKey)) {
                                if (!i18n.hasKey(fallbackTranslationKey)) {
                                    throw new Error(
                                        `Missing slash command description: ${translationKey} or ${fallbackTranslationKey}`,
                                    );
                                }

                                translationKey = fallbackTranslationKey;
                            }

                            cmd.description = i18n.translate(
                                LocaleType.EN,
                                translationKey,
                            );

                            cmd.descriptionLocalizations = Object.values(
                                LocaleType,
                            )
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            translationKey,
                                        ),
                                    }),
                                    {},
                                );
                        }
                    }

                    if (!cmd.name) {
                        if (!i18n.hasKey(`command.${commandName}.help.name`)) {
                            throw new Error(
                                `Missing slash command name: command.${commandName}.help.name`,
                            );
                        }

                        cmd.name = i18n.translate(
                            LocaleType.EN,
                            `command.${commandName}.help.name`,
                        );
                    }

                    if (command.slashCommandAlias) {
                        const aliasedCmd = structuredClone(cmd);

                        if (
                            !i18n.hasKey(
                                `command.${command.slashCommandAlias}.help.name`,
                            )
                        ) {
                            throw new Error(
                                `Missing slash command name: command.${command.slashCommandAlias}.help.name`,
                            );
                        }

                        aliasedCmd.name = i18n.translate(
                            LocaleType.EN,
                            `command.${command.slashCommandAlias}.help.name`,
                        );
                        commandStructures.push(aliasedCmd);
                    }

                    commandStructures.push(cmd);
                }
            }
        }
    } else {
        commandStructures = [];
    }

    if (isProd) {
        await State.client.bulkEditCommands(commandStructures);
    } else {
        const debugServer = State.client.guilds.get(
            process.env.DEBUG_SERVER_ID as string,
        );

        if (debugServer) {
            await State.client.bulkEditGuildCommands(
                debugServer.id,
                commandStructures,
            );
        } else {
            logger.warn("Debug server unexpectedly unavailable");
        }
    }

    await State.ipc.allClustersCommand("fetch_app_command_ids");
};

/**
 * Sends a message to the user that the command failed
 * @param messageContext - the message context
 * @param commandName - the name of the command that failed
 * @param err - the error that occurred
 */
export async function notifyOptionsGenerationError(
    messageContext: MessageContext,
    commandName: string,
): Promise<void> {
    const debugId = uuid.v4();

    logger.error(
        `${getDebugLogHeader(
            messageContext,
        )} | Error generating options embed payload in ${commandName}. debugId = ${debugId}`,
    );

    await sendErrorMessage(messageContext, {
        title: i18n.translate(
            messageContext.guildID,
            "misc.failure.optionsGeneration.title",
        ),
        description: i18n.translate(
            messageContext.guildID,
            "misc.failure.optionsGeneration.description",
            {
                resetCommand: clickableSlashCommand("reset"),
                helpCommand: clickableSlashCommand("help"),
                debugId,
            },
        ),
    });
}

/**
 * Gets all slash commands associated with a command
 * @param commandName - The command name
 * @returns a list of slash commands, formatted for Discord
 */
export function getAllClickableSlashCommands(commandName: string): string {
    const commandFiles = State.client.commands;
    const command = commandFiles[commandName];
    if (!command) {
        logger.error(
            `Command ${commandName} unexpectedly not found in getAllClickableSlashCommands`,
        );
        return "";
    }

    if (!command.slashCommands) {
        logger.error(
            `Command ${commandName} unexpectedly missing slashCommands in getAllClickableSlashCommands`,
        );
        return "";
    }

    const results: string[] = [];
    const slashCommands = command.slashCommands();
    for (const slashCommand of slashCommands) {
        if (!slashCommand.options) {
            results.push(clickableSlashCommand(commandName));
            continue;
        }

        for (const option of slashCommand.options) {
            if (
                option.type ===
                Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
            ) {
                for (const subOption of option.options!) {
                    results.push(
                        clickableSlashCommand(
                            commandName,
                            `${option.name} ${subOption.name}`,
                        ),
                    );
                }
            } else {
                const optionName =
                    option.type ===
                    Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND
                        ? option.name
                        : undefined;

                results.push(clickableSlashCommand(commandName, optionName));
            }
        }
    }

    return results.join(" ");
}
