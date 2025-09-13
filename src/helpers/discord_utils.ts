/* eslint-disable @typescript-eslint/no-use-before-define */
import * as uuid from "uuid";
import {
    ConflictingGameOptions,
    GameOptionCommand,
    PriorityGameOption,
} from "../types.js";
import {
    DataFiles,
    EMBED_DESCRIPTION_MAX_LENGTH,
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
} from "../constants.js";
import { IPCLogger } from "../logger.js";
import {
    bold,
    chooseWeightedRandom,
    chunkArray,
    containsHangul,
    delay,
    extractErrorString,
    friendlyFormattedNumber,
    getOrdinalNum,
    italicize,
    parseKmqPlaylistIdentifier,
    pathExists,
    standardDateFormat,
    strikethrough,
    truncatedString,
    underline,
} from "./utils.js";
import { exec } from "child_process";
import { userBonusIsActive } from "./game_utils.js";
import AppCommandsAction from "../enums/app_command_action.js";
import EmbedPaginator from "eris-pagination";
import EnvType from "../enums/env_type.js";
import { DiscordHTTPError, DiscordRESTError } from "eris";
import * as Eris from "eris";
import GameOption from "../enums/game_option_name.js";
import GameRound from "../structures/game_round.js";
import GameType from "../enums/game_type.js";
import LocaleType from "../enums/locale_type.js";
import MessageContext from "../structures/message_context.js";
import State from "../state.js";
import _ from "lodash";
import axios from "axios";
import dbContext from "../database_context.js";
import fs from "fs";
import i18n from "./localization_manager.js";
import type { EmbedGenerator, GuildTextableMessage } from "../types.js";
import type { GuildTextableChannel } from "eris";
import type AutocompleteEntry from "../interfaces/autocomplete_entry.js";
import type BookmarkedSong from "../interfaces/bookmarked_song.js";
import type EmbedPayload from "../interfaces/embed_payload.js";
import type GameInfoMessage from "../interfaces/game_info_message.js";
import type GameOptions from "../interfaces/game_options.js";
import type GuildPreference from "../structures/guild_preference.js";
import type MatchedArtist from "../interfaces/matched_artist.js";
import type Session from "../structures/session.js";

const logger = new IPCLogger("discord_utils");

const REQUIRED_TEXT_PERMISSIONS = [
    "addReactions" as const,
    "embedLinks" as const,
    "attachFiles" as const,
    "viewChannel" as const,
];

const REQUIRED_VOICE_PERMISSIONS = [
    "viewChannel" as const,
    "voiceConnect" as const,
    "voiceSpeak" as const,
];

const MAX_INTERACTION_RESPONSE_TIME = 3 * 1000;

interface GameMessageMultiLocaleContent {
    [LocaleType.EN]: string;
    [LocaleType.KO]: string;
    [LocaleType.FR]: string;
    [LocaleType.ES]: string;
    [LocaleType.JA]: string;
    [LocaleType.ZH]: string;
    [LocaleType.NL]: string;
    [LocaleType.ID]: string;
    [LocaleType.PT]: string;
    [LocaleType.RU]: string;
    [LocaleType.DE]: string;
    [LocaleType.HI]: string;
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
 * Fetches Users from cache or via REST and update cache
 * @param userID - the user's ID
 * @param silentErrors - whether to log errors
 * @returns an instance of the User
 */
export async function fetchUser(
    userID: string,
    silentErrors = false,
): Promise<Eris.User | null> {
    let user: Eris.User | undefined;
    const { client } = State;

    // fetch via cache
    user = client.users.get(userID);

    // fetch via REST
    if (!user) {
        try {
            user = await client.getRESTUser(userID);
            logger.info(`User not in cache, fetched via REST: ${userID}`);
        } catch (err) {
            if (!silentErrors)
                logger.warn(
                    `Could not fetch user: ${userID}. err: ${err.code}. msg: ${err.message}`,
                );
            return null;
        }
    }

    // update cache
    client.users.update(user, client);
    return user;
}

/**
 * Fetches TextChannel from cache, or via REST and update cache
 * @param textChannelID - the text channel's ID
 * @returns an instance of the TextChannel
 */
export async function fetchChannel(
    textChannelID: string,
): Promise<Eris.TextChannel | null> {
    let channel: Eris.TextChannel | undefined;
    const { client } = State;

    // fetch via cache
    channel = client.getChannel(textChannelID) as Eris.TextChannel | undefined;

    // fetch via REST if channel is not cached for some reason
    if (!channel) {
        try {
            channel = (await client.getRESTChannel(
                textChannelID,
            )) as Eris.TextChannel;

            logger.info(
                `Text channel (${textChannelID}) not in cache, fetching channel via REST`,
            );

            // guild is partial, grab and cache
            if (!channel.guild.name) {
                try {
                    logger.info(
                        `Text channel (${textChannelID}) not in cache, fetching guild (${channel.guild.id}) via REST`,
                    );
                    const guild = await client.getRESTGuild(channel.guild.id);
                    channel.guild = guild;

                    client.guilds.update(guild, client);
                    logger.info(
                        `Text channel (${textChannelID}) not in cache, fetching bot client (${process.env.BOT_CLIENT_ID!}) via REST`,
                    );
                    const member = await client.getRESTGuildMember(
                        channel.guild.id,
                        process.env.BOT_CLIENT_ID!,
                    );

                    guild.members.update(member);
                } catch (e) {
                    logger.warn(
                        `Failed while fetching corresponding channel metadata via REST: ${extractErrorString(e)}`,
                    );
                }
            }
        } catch (err) {
            logger.warn(
                `Could not fetch text channel: ${textChannelID}. err: ${err.code}. msg: ${err.message}`,
            );
            return null;
        }
    }

    // update cache
    const guild = client.guilds.get(channel.guild.id);
    if (guild) {
        guild.channels.update(channel);
        client.channelGuildMap[channel.id] = guild.id;
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
        !["sendMessages" as const, "viewChannel" as const].every((permission) =>
            channel
                .permissionsOf(process.env.BOT_CLIENT_ID as string)
                .has(permission),
        )
    ) {
        logger.warn(
            `${getDebugLogHeader(
                messageContext,
            )} | Missing SEND_MESSAGES or VIEW_CHANNEL permissions`,
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

        await sendMessage(channel.id, {
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
    messageContent: Eris.AdvancedMessageContent | undefined,
    messageOrInteraction:
        | GuildTextableMessage
        | Eris.CommandInteraction
        | undefined,
): Promise<void> {
    if (typeof e === "string") {
        if (e.startsWith("Request timed out")) {
            logger.warn(
                `Error sending message. Request timed out. textChannelID = ${channelID}.`,
            );
        }
    } else if (e instanceof DiscordRESTError || e instanceof DiscordHTTPError) {
        const errCode = e.code;
        switch (errCode) {
            // transient backend errors
            case 500:
            case 503:
            case 504:
            case 520:
            case "ETIMEDOUT" as any:
                logger.warn(
                    `Error sending message. Transient Discord error. textChannelID. code = ${e.code} name = ${e.name}. message = ${e.message}. stack = ${e.stack}`,
                );
                break;

            case 50035: {
                // Invalid Form Body
                logger.error(
                    `Error sending message. Invalid form body. textChannelID = ${channelID}. e.message = ${
                        e.message
                    }. msg_content = ${JSON.stringify(messageContent)}. stack = ${new Error().stack}`,
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

            case 10062: {
                // Interaction too old
                if (messageOrInteraction) {
                    logger.warn(
                        `Error sending message. Unknown interaction. textChannelID = ${channelID}. userID = ${authorID}. interaction_age: ${Date.now() - messageOrInteraction.createdAt}ms. stack = ${new Error().stack}`,
                    );
                } else {
                    logger.warn(
                        `Error sending message. Unknown interaction. textChannelID = ${channelID}. userID = ${authorID}. stack = ${new Error().stack}`,
                    );
                }

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
    } else if (e instanceof Error) {
        if (
            ["Request timed out", "connect ETIMEDOUT"].some((errString) =>
                e.message.includes(errString),
            )
        ) {
            logger.warn(
                `Error sending message. Request timed out. textChannelID = ${channelID}. Name: ${e.name}. Reason: ${e.message}. Stack: ${e.stack}`,
            );

            return;
        }

        logger.error(
            `Error sending message. Unknown generic error. textChannelID = ${channelID}. Name: ${e.name}. Reason: ${e.message}. Stack: ${e.stack}`,
        );
    } else {
        let details = "";
        // pray that it has a toString()
        if (e.toString) {
            details += e.toString();
        }

        // maybe we can stringify it too
        try {
            details += JSON.stringify(e);
        } catch (err) {
            logger.warn(
                `Couldn't stringify error of unknown type: ${typeof e}`,
            );
        }

        logger.error(
            `Error sending message. Error of unknown type? type = ${typeof e}. details = ${details}. textChannelID = ${channelID}`,
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
    // test bot request, reply with same run ID
    if (!interaction && messageContent.messageReference) {
        const testRunnerChannel = State.client.getChannel(textChannelID!) as
            | Eris.TextChannel
            | undefined;

        const message = testRunnerChannel?.messages.get(
            messageContent.messageReference.messageID,
        );

        if (
            message &&
            message.author.id === process.env.END_TO_END_TEST_BOT_CLIENT &&
            message.embeds[0]
        ) {
            const runIdAndCommand = `${process.env.RUN_ID}|${message.content}`;
            const messageFooter = messageContent.embeds![0]!.footer;
            if (messageFooter) {
                messageFooter.text += `\n${runIdAndCommand}`;
            } else {
                messageContent.embeds![0]!.footer = {
                    text: runIdAndCommand,
                };
            }
        }
    }

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

    if (messageContent.embeds) {
        for (const embed of messageContent.embeds.values()) {
            if (embed.title) {
                if (embed.title.length > 256) {
                    logger.error(`Title was too long. title = ${embed.title}`);
                    embed.title = truncatedString(embed.title!, 255);
                }
            }

            if (embed.description) {
                if (embed.description.length > EMBED_DESCRIPTION_MAX_LENGTH) {
                    logger.error(
                        `Description was too long. title = ${embed.description}`,
                    );

                    embed.description = truncatedString(
                        embed.description,
                        4095,
                    );
                }
            }

            if (embed.footer) {
                if (embed.footer.text.length > 2048) {
                    logger.error(
                        `Footer was too long. title = ${embed.footer}`,
                    );

                    embed.footer.text = truncatedString(
                        embed.footer.text,
                        2047,
                    );
                }
            }

            if (embed.fields) {
                for (const field of embed.fields) {
                    if (field.name.length > 256) {
                        logger.error(
                            `Field name was too long. field.name = ${field.name}`,
                        );
                        field.name = truncatedString(field.name, 255);
                    }

                    if (field.value.length > 1024) {
                        logger.error(
                            `Field value was too long. field.value = ${field.value}`,
                        );
                        field.value = truncatedString(field.value, 1023);
                    }
                }
            }
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
                undefined,
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
export async function sendDmMessage(
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
            undefined,
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
        embedPayload.author == null
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
            components: embedPayload.actionRows,
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
        embedPayload.author == null
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

    // always reply if during test-run
    reply =
        reply ||
        messageContext.author.id === process.env.END_TO_END_TEST_BOT_CLIENT;

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
            components: embedPayload.actionRows,
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
 * @param interaction - The interaction
 *  @returns an embed of current game options
 */
export async function generateOptionsMessage(
    session: Session | undefined,
    messageContext: MessageContext,
    guildPreference: GuildPreference,
    updatedOptions: { option: GameOption; reset: boolean }[],
    preset = false,
    allReset = false,
    interaction?: Eris.CommandInteraction,
): Promise<EmbedPayload | null> {
    if (guildPreference.gameOptions.forcePlaySongID) {
        return {
            title: "[DEBUG] Force Play Mode Active",
            description: `Force playing video ID: ${guildPreference.gameOptions.forcePlaySongID}`,
            thumbnailUrl: KmqImages.READING_BOOK,
        };
    }

    const guildID = messageContext.guildID;

    // Store the VALUE of ,[option]: [VALUE] into optionStrings
    // Null optionStrings values are set to "Not set" below
    const optionStrings: { [option: string]: string | null } = {};

    const gameOptions = guildPreference.gameOptions;
    const kmqPlaylistIdentifier = gameOptions.spotifyPlaylistID;
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

    const totalSongs = await guildPreference.getAvailableSongCount();

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
    optionStrings[GameOption.MULTIGUESS] = gameOptions.multiGuessType;
    optionStrings[GameOption.SHUFFLE_TYPE] = gameOptions.shuffleType;
    optionStrings[GameOption.SEEK_TYPE] = gameOptions.seekType;
    optionStrings[GameOption.GUESS_MODE_TYPE] = gameOptions.guessModeType;
    optionStrings[GameOption.SPECIAL_TYPE] = gameOptions.specialType;

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

    const isClipMode =
        session?.isGameSession() && session.gameType === GameType.CLIP;

    // Special case: timer is conflicting only when current game is clip
    if (guildPreference.isGuessTimeoutSet()) {
        optionStrings[GameOption.TIMER] = i18n.translate(
            guildID,
            "command.options.timer",
            {
                timerInSeconds: String(gameOptions.guessTimeout),
            },
        );

        if (isClipMode) {
            optionStrings[GameOption.TIMER] = generateConflictingCommandEntry(
                optionStrings[GameOption.TIMER] as string,
                `play ${GameType.CLIP}`,
            );
        }
    }

    // Special case: seek is conflicting only when current game is clip
    if (isClipMode) {
        optionStrings[GameOption.SEEK_TYPE] = generateConflictingCommandEntry(
            optionStrings[GameOption.SEEK_TYPE] as string,
            `play ${GameType.CLIP}`,
        );
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
            const conflictingGameOptionMapping =
                ConflictingGameOptions[gameOptionConflictCheck.gameOption];

            if (!conflictingGameOptionMapping) {
                logger.error(
                    `Missing conflicting game option mapping: ${gameOptionConflictCheck.gameOption}`,
                );
                continue;
            }

            for (const option of conflictingGameOptionMapping) {
                const optionString = optionStrings[option];
                if (optionString && !optionString.includes(conflictString)) {
                    optionStrings[option] = generateConflictingCommandEntry(
                        optionString,
                        GameOptionCommand[gameOptionConflictCheck.gameOption]!,
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
                `${clickableSlashCommand(GameOptionCommand[option]!)}: ${
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
                `${clickableSlashCommand(GameOptionCommand[option]!)}: ${
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
                `${clickableSlashCommand(GameOptionCommand[option]!)}: ${
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
                `${clickableSlashCommand(GameOptionCommand[option]!)}: ${
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

    let footerText: string = "";
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
            title = updatedOptions[0]!.option;
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

    if (State.playlistManager.isParseInProgress(guildID)) {
        description += italicize(
            i18n.translate(
                messageContext.guildID,
                "command.options.playlistParseInProgress",
            ),
        );
        description += "\n\n";
    }

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
 * @param interaction - The interaction
 */
export async function sendOptionsMessage(
    session: Session | undefined,
    messageContext: MessageContext,
    guildPreference: GuildPreference,
    updatedOptions: { option: GameOption; reset: boolean }[],
    preset = false,
    allReset = false,
    interaction?: Eris.CommandInteraction,
): Promise<void> {
    const optionsEmbed = await generateOptionsMessage(
        session,
        messageContext,
        guildPreference,
        updatedOptions,
        preset,
        allReset,
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
    const endGameMessage: GameInfoMessage | null = chooseWeightedRandom(
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
    if (embeds.length === 0) {
        logger.warn("sendPaginationedEmbed received embed empty response");
        return null;
    }

    if (embeds.length > 1) {
        if (
            await textPermissionsCheck(
                messageOrInteraction.channel.id,
                messageOrInteraction.guildID as string,
                messageOrInteraction.member!.id,
                [...REQUIRED_TEXT_PERMISSIONS, "readMessageHistory"],
            )
        ) {
            try {
                return await EmbedPaginator.createPaginationEmbed(
                    messageOrInteraction.channel as GuildTextableChannel,
                    messageOrInteraction.member!.id,
                    embeds,
                    { timeout: 60000, startPage, cycling: true },
                    components,
                    messageOrInteraction instanceof Eris.CommandInteraction
                        ? messageOrInteraction
                        : undefined,
                );
            } catch (e) {
                await sendMessageExceptionHandler(
                    e,
                    messageOrInteraction.channel.id,
                    messageOrInteraction.guildID,
                    messageOrInteraction.member?.id,
                    undefined,
                    messageOrInteraction,
                );
            }
        }

        return null;
    }

    let embed: Eris.EmbedOptions;
    if (typeof embeds[0] === "function") {
        embed = await embeds[0]();
    } else {
        embed = embeds[0]!;
    }

    return sendMessage(
        messageOrInteraction.channel.id,
        {
            embeds: [embed],
            components,
            messageReference: { messageID: messageOrInteraction.id },
        },
        messageOrInteraction.member?.id,
        messageOrInteraction instanceof Eris.CommandInteraction
            ? messageOrInteraction
            : undefined,
    );
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

    if (!member || !botVoiceConnection) {
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
export function getVoiceChannel(
    voiceChannelID: string,
): Eris.VoiceChannel | null {
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
        .filter(
            (x) => !x.bot || x.id === process.env.END_TO_END_TEST_BOT_CLIENT,
        )
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
export async function voicePermissionsCheck(
    messageContext: MessageContext,
    interaction?: Eris.CommandInteraction,
): Promise<boolean> {
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

        await sendErrorMessage(
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
        await sendInfoMessage(messageContext, {
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

        await sendInfoMessage(messageContext, {
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
 * @param webhookURL - The webhook URL
 * @param title - The embed title
 * @param description - the embed description
 * @param color - The embed color
 * @param avatarUrl - The avatar URL to show on the embed
 * @param username - The username to show on the embed
 */
export async function sendInfoWebhook(
    webhookURL: string,
    title: string,
    description: string,
    color: number,
    avatarUrl: string | undefined,
    username: string | undefined,
): Promise<void> {
    if (!webhookURL) return;
    await axios.post(webhookURL, {
        embeds: [
            {
                title,
                description,
                color,
            },
        ],
        username,
        avatar_url: avatarUrl,
        footerText: State.version,
    });
}

/**
 * Sends an alert to the message webhook
 * @param webhookURL - The webhook URL
 * @param embed - the embed payload
 * @param content - the body text
 * @param avatarUrl - The avatar URL to show on the embed
 * @param username - The username to show on the embed
 */
export async function sendInfoEmbedsWebhook(
    webhookURL: string,
    embed: EmbedPayload,
    content: string | undefined,
    avatarUrl: string | undefined,
    username: string | undefined,
): Promise<void> {
    if (!webhookURL) return;
    await axios.post(webhookURL, {
        content,
        embeds: [
            {
                title: embed.title,
                fields: embed.fields,
                description: embed.description,
                footer: { text: embed.footerText },
                thumbnail: { url: embed.thumbnailUrl },
            },
        ],
        username,
        avatar_url: avatarUrl,
    });
}

/**
 * Sends an file to the webhook
 * @param message - The message
 * @param webhookURL - The webhook URL
 * @param fileContents - The string file contents
 * @param fileName - The filename
 */
export async function sendDebugAlertFileWebhook(
    message: string | null,
    webhookURL: string,
    fileContents: string,
    fileName: string,
): Promise<void> {
    if (!webhookURL) {
        logger.warn(
            "sendDebugAlertFileWebhook failed due to non specified webhookURL",
        );
        return;
    }

    const fileContent = Buffer.from(fileContents, "utf-8");

    const formData = new FormData();
    if (message) {
        formData.append("content", message);
    }

    formData.append("file", new Blob([fileContent]), fileName);

    try {
        await axios.post(webhookURL, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
    } catch (e) {
        logger.error(`Error sending webhook: ${e}`);
    }
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
                    `"${bookmarkedSong[1].song.getLocalizedSongName(
                        locale,
                    )}" - ${bookmarkedSong[1].song.getLocalizedArtistName(
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
    err: any,
): void {
    if (err instanceof DiscordRESTError || err instanceof DiscordHTTPError) {
        switch (err.code) {
            case 10062:
                logger.warn(
                    `${getDebugLogHeader(
                        interaction,
                    )} | Interaction acknowledge (unknown interaction)`,
                );
                break;
            case 40060:
                logger.warn(
                    `${getDebugLogHeader(
                        interaction,
                    )} | Interaction already acknowledged`,
                );
                break;
            case 503:
                logger.warn(
                    `${getDebugLogHeader(
                        interaction,
                    )} | Interaction acknowledge failed (Bad Gateway)`,
                );
                break;
            default:
                logger.error(
                    `${getDebugLogHeader(
                        interaction,
                    )} | Unknown Discord error acknowledging interaction. code = ${err.code}. ${extractErrorString(err)}`,
                );
                break;
        }
    } else if (err instanceof Error) {
        if (
            ["Request timed out"].some((errString) =>
                err.message.includes(errString),
            )
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    interaction,
                )} | Request timeout while acknowledging interaction. ${extractErrorString(err)}`,
            );
            return;
        }

        logger.error(
            `${getDebugLogHeader(
                interaction,
            )} | Unknown generic error acknowledging interaction. ${extractErrorString(err)}`,
        );
    } else {
        let details = "";
        // pray that it has a toString()
        if (err.toString) {
            details += err.toString();
        }

        // maybe we can stringify it too
        try {
            details += JSON.stringify(err);
        } catch (e) {
            logger.warn(
                `${getDebugLogHeader(
                    interaction,
                )} | Couldn't stringify error of unknown type in interactionRejectionHandler: ${typeof err}`,
            );
        }

        logger.error(
            `${getDebugLogHeader(
                interaction,
            )} | Error acknowledging interaction. Error of unknown type? type = ${typeof err}. details = ${details}`,
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
export async function sendPowerHourNotification(): Promise<void> {
    if (!process.env.POWER_HOUR_NOTIFICATION_ROLE_ID) {
        return;
    }

    logger.info("Sending power hour notification");
    await sendInfoEmbedsWebhook(
        process.env.POWER_HOUR_NOTIF_WEBHOOK_URL!,
        {
            title: "⬆️ KMQ Power Hour Starts Now! ⬆️",
            description: "Earn 2x EXP for the next hour!",
            thumbnailUrl: KmqImages.LISTENING,
        },
        `<@&${process.env.POWER_HOUR_NOTIFICATION_ROLE_ID}>`,
        undefined,
        undefined,
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
    const options = interaction.data.options;
    if (!options) {
        return {
            interactionKey: null,
            interactionOptions: {},
            interactionName: null,
            focusedKey: null,
        };
    }

    let parentInteractionDataName: string | null = null;
    const keys: Array<string> = [];

    let finalOptions = options;
    while (finalOptions.length > 0) {
        const option = finalOptions[0]!;
        keys.push(option.name);
        if (
            option.type ===
                Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND ||
            option.type ===
                Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
        ) {
            parentInteractionDataName = option.name;
            const newOptions = option.options;
            if (!newOptions) break;

            finalOptions = newOptions;
        } else {
            break;
        }
    }

    return {
        interactionKey: keys.join("."),
        interactionOptions: (
            finalOptions as Eris.InteractionDataOptionsWithValue[]
        ).reduce(
            (result, filter: Eris.InteractionDataOptionsWithValue) => {
                result[filter.name] = filter.value;
                return result;
            },
            {} as { [name: string]: string | number | boolean },
        ),
        interactionName: parentInteractionDataName,
        focusedKey: finalOptions.find((x) => x["focused"])?.name ?? null,
    };
}

/**
 * Retrieve artist names purely for interaction autocomplete
 * @param enteredNames - Artist names the user has entered
 * @returns the matched artists
 */
function getMatchedArtistsForAutocomplete(enteredNames: Array<string>): {
    matchedGroups: Array<MatchedArtist>;
    unmatchedGroups: Array<string>;
} {
    const matchedGroups: Array<MatchedArtist> = [];
    const unmatchedGroups: Array<string> = [];
    for (const artistName of enteredNames) {
        const match =
            State.artistToEntry[
                GameRound.normalizePunctuationInName(artistName)
            ];

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
    const lowercaseUserInput = GameRound.normalizePunctuationInName(focusedVal);

    const previouslyEnteredArtists = getMatchedArtistsForAutocomplete(
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
 * Updates the Discord slash commands
 * @param appCommandType - Whether to reload or delete app commands
 * @param guildId - The server ID to deploy guild commands to
 */
export const updateAppCommands = async (
    appCommandType = AppCommandsAction.RELOAD,
    guildId?: string,
): Promise<{ [commandName: string]: string }> => {
    const isProd = process.env.NODE_ENV === EnvType.PROD;

    let commandStructures: Eris.ApplicationCommandStructure[] = [];

    if (appCommandType === AppCommandsAction.RELOAD) {
        commandStructures = [
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
                                    [locale]: i18n
                                        .translate(
                                            locale,
                                            `command.${commandName}.help.name`,
                                        )
                                        .replace(" ", ""),
                                }),
                                {},
                            );

                    switch (cmd.type) {
                        case Eris.Constants.ApplicationCommandTypes.CHAT_INPUT:
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

                            break;
                        default:
                            break;
                    }

                    if (!cmd.name) {
                        if (!i18n.hasKey(`command.${commandName}.help.name`)) {
                            throw new Error(
                                `Missing slash command name: command.${commandName}.help.name`,
                            );
                        }

                        cmd.name = i18n
                            .translate(
                                LocaleType.EN,
                                `command.${commandName}.help.name`,
                            )
                            .replace(" ", "");
                    }

                    if (command.slashCommandAliases) {
                        for (const slashCommandAlias of command.slashCommandAliases) {
                            const aliasedCmd = structuredClone(cmd);

                            if (
                                !i18n.hasKey(
                                    `command.${slashCommandAlias}.help.name`,
                                )
                            ) {
                                throw new Error(
                                    `Missing slash command name: command.${slashCommandAlias}.help.name`,
                                );
                            }

                            aliasedCmd.name = i18n
                                .translate(
                                    LocaleType.EN,
                                    `command.${slashCommandAlias}.help.name`,
                                )
                                .replace(" ", "");
                            commandStructures.push(aliasedCmd);
                        }
                    }

                    commandStructures.push(cmd);
                }
            }
        }
    } else {
        commandStructures = [];
    }

    let appCommands: Eris.AnyApplicationCommand<true>[] = [];
    if (isProd) {
        try {
            logger.info("bulkEditCommands begin");
            appCommands =
                await State.client.bulkEditCommands(commandStructures);
            logger.info("bulkEditCommands finish");
        } catch (e) {
            if ((e as Error).message.includes("Request timed out")) {
                logger.warn(`Timeout during bulkEditCommands: ${e}`);
            } else {
                logger.warn(`Error during bulkEditCommands: ${e}`);
            }
        }
    } else {
        if (guildId) {
            try {
                logger.info(`bulkEditGuildCommands begin for ${guildId}`);
                appCommands = await State.client.bulkEditGuildCommands(
                    guildId,
                    commandStructures,
                );
                logger.info("bulkEditGuildCommands finish");
            } catch (e) {
                if ((e as Error).message.includes("Request timed out")) {
                    logger.warn(`Timeout during bulkEditGuildCommands: ${e}`);
                } else {
                    logger.error(`Error during bulkEditGuildCommands: ${e}`);
                }
            }
        } else {
            logger.warn("Debug server unexpectedly unavailable");
        }
    }

    if (appCommandType === AppCommandsAction.RELOAD) {
        if (appCommands.length > 0) {
            const commandToID: { [commandName: string]: string } = {};
            for (const command of appCommands) {
                commandToID[command.name] = command.id;
            }

            await fs.promises.writeFile(
                DataFiles.CACHED_APP_CMD_IDS,
                JSON.stringify(commandToID),
            );

            return commandToID;
        }

        // if update app command failed, use cached IDs instead
        return getCachedAppCommandIds();
    }

    return {};
};

/**
 * Gets cached app command IDs
 */
export async function getCachedAppCommandIds(): Promise<{
    [commandName: string]: string;
}> {
    if (await pathExists(DataFiles.CACHED_APP_CMD_IDS)) {
        try {
            const cachedAppCommandMap = JSON.parse(
                (
                    await fs.promises.readFile(DataFiles.CACHED_APP_CMD_IDS)
                ).toString(),
            );

            logger.info(
                `Loaded cached app command IDs: ${JSON.stringify(cachedAppCommandMap)}`,
            );
            return cachedAppCommandMap;
        } catch (e) {
            logger.error(`Failed loading cached app command IDs: ${e}`);
        }
    }

    return {};
}

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

/**
 * @param commandName - The name of the slash command
 * @param subcommandName - The suboption of the slash command
 * @param subcommandGroupName - The suboption group of the slash command
 * @returns a formatted version of the slash command, that allows users to click
 */
export function clickableSlashCommand(
    commandName: string,
    subcommandName?: string,
    subcommandGroupName?: string,
): string {
    let commandAndSubcommand = commandName;

    if (!subcommandName) {
        if (Object.values(GameOptionCommand).includes(commandName)) {
            subcommandName = "set";
            if (commandName === GameOptionCommand[GameOption.LIMIT]) {
                subcommandName = "set top";
            } else if (commandName === GameOptionCommand[GameOption.CUTOFF]) {
                subcommandName = "set earliest";
            }
        }

        switch (commandName) {
            case "play":
                subcommandName = "classic";
                break;
            case "add":
            case "remove":
                commandName = "groups";
                subcommandName = commandName;
                break;
            case "preset":
                subcommandName = "list";
                break;
            case "leaderboard":
                subcommandName = "show";
                break;
            case "lookup":
                subcommandName = "song_name";
                break;
            case "news":
                subcommandName = "daily";
                break;
            default:
                break;
        }
    }

    if (subcommandName) {
        commandAndSubcommand = `${commandName} ${subcommandName}`;
        if (subcommandGroupName) {
            commandAndSubcommand = `${commandAndSubcommand} ${subcommandGroupName}`;
        }
    }

    return `</${commandAndSubcommand}:${State.commandToID[commandName]}>`;
}

/**
 * Gets the clip's average volume
 * @param audioFile - the audio file's location
 * @param inputArgs - the input args
 * @param encoderArgs - the encoder args
 * @returns the average volume
 */
export function getAverageVolume(
    audioFile: string,
    inputArgs: string[],
    encoderArgs: string[],
): Promise<number> {
    return new Promise((resolve, reject) => {
        exec(
            `ffmpeg -i "${audioFile}" ${inputArgs.join(" ")} ${encoderArgs.join(" ")} -af 'volumedetect' -f null /dev/null 2>&1 | grep mean_volume | awk -F': ' '{print $2}' | cut -d' ' -f1;`,
            (err, stdout, stderr) => {
                if (!stdout || stderr) {
                    logger.error(
                        `Error getting average volume: path = ${audioFile}, err = ${stderr}`,
                    );
                    reject();
                    return;
                }

                resolve(parseFloat(stdout));
            },
        );
    });
}
