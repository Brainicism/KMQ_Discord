import Eris, { EmbedOptions, TextableChannel, TextChannel } from "eris";
import EmbedPaginator from "eris-pagination";
import axios from "axios";
import GuildPreference from "../structures/guild_preference";
import GameSession, { UniqueSongCounter } from "../structures/game_session";
import { IPCLogger } from "../logger";
import { getSongCount, userBonusIsActive } from "./game_utils";
import { getFact } from "../fact_generator";
import { EmbedPayload, GameOption, GameOptionCommand, PriorityGameOption, ConflictingGameOptions, GuildTextableMessage, PlayerRoundResult, EndGameMessage, GameType } from "../types";
import { chunkArray, codeLine, bold, underline, italicize, strikethrough, chooseWeightedRandom, getOrdinalNum, friendlyFormattedNumber } from "./utils";
import { state } from "../kmq";
import Scoreboard from "../structures/scoreboard";
import GameRound from "../structures/game_round";
import dbContext from "../database_context";
import EliminationScoreboard from "../structures/elimination_scoreboard";
import TeamScoreboard from "../structures/team_scoreboard";
import { KmqImages } from "../constants";
import MessageContext from "../structures/message_context";
import { GuessModeType } from "../commands/game_options/guessmode";

const logger = new IPCLogger("utils");
export const EMBED_INFO_COLOR = 0x000000; // BLACK
export const EMBED_ERROR_COLOR = 0xE74C3C; // RED
export const EMBED_SUCCESS_COLOR = 0x00FF00; // GREEN
export const EMBED_SUCCESS_BONUS_COLOR = 0xFFD700; // GOLD
const EMBED_FIELDS_PER_PAGE = 20;
const REQUIRED_TEXT_PERMISSIONS = ["addReactions" as const, "embedLinks" as const];
const REQUIRED_VOICE_PERMISSIONS = ["viewChannel" as const, "voiceConnect" as const, "voiceSpeak" as const];
const SCOREBOARD_FIELD_CUTOFF = 9;
const MAX_SCOREBOARD_PLAYERS = 30;

/**
 * @param user - The user (must be some object with username and discriminator fields)
 * @returns the user's Discord tag
 */
export function getUserTag(user: { username: string, discriminator: string }): string {
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
 * @param missingPermissions - List of missing text permissions
 * @returns a friendly string describing the missing text permissions
 */
function missingPermissionsText(missingPermissions: string[]): string {
    return `Ensure that the bot has the following permissions: \`${missingPermissions.join(", ")}\`\n\nSee the following link for details: https://support.discord.com/hc/en-us/articles/206029707-How-do-I-set-up-Permissions-. If you are still having issues, join the official KMQ server found in \`${process.env.BOT_PREFIX}help\``;
}

/**
 * @param textChannelID - the text channel's ID
 * @param authorID - the sender's ID
 * @returns whether the bot has permissions to message's originating text channel
 */
export async function textPermissionsCheck(textChannelID: string, guildID: string, authorID: string): Promise<boolean> {
    const { client } = state;
    const messageContext = new MessageContext(textChannelID, null, guildID);
    const channel = client.getChannel(textChannelID) as TextChannel;
    if (!channel.permissionsOf(client.user.id).has("sendMessages")) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Missing SEND_MESSAGES permissions`);
        const embed = {
            color: EMBED_INFO_COLOR,
            title: "Missing Permissions",
            description: `Hi! I'm unable to message in ${channel.guild.name}'s #${channel.name} channel. Please make sure the bot has permissions to message in this channel.`,
        };

        const dmChannel = await client.getDMChannel(authorID);
        await client.createMessage(dmChannel.id, { embed });
        return false;
    }

    const missingPermissions = REQUIRED_TEXT_PERMISSIONS.filter((permission) => !channel.permissionsOf(client.user.id).has(permission));
    if (missingPermissions.length > 0) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Missing Text Channel [${missingPermissions.join(", ")}] permissions`);
        client.createMessage(channel.id, {
            content: missingPermissionsText(missingPermissions),
        });
        return false;
    }

    return true;
}

/**
 * A lower level message sending utility
 * and when a Eris Message object isn't available in the context
 * @param textChannelID - The channel ID where the message should be delivered
 * @param authorID - the author's ID
 * @param messageContent - The MessageContent to send
 */
async function sendMessage(textChannelID: string, authorID: string, messageContent: Eris.AdvancedMessageContent): Promise<Eris.Message> {
    const channel = state.client.getChannel(textChannelID) as Eris.TextChannel;

    // only reply to message if has required permissions
    if (!channel.permissionsOf(state.client.user.id).has("readMessageHistory")) {
        if (messageContent.messageReference) {
            messageContent.messageReference = null;
        }
    }

    try {
        return await state.client.createMessage(textChannelID, messageContent);
    } catch (e) {
        // check for text permissions if sending message failed
        if (!(await textPermissionsCheck(textChannelID, channel.guild.id, authorID))) {
            return null;
        }

        logger.error(`Error sending message. textChannelID = ${textChannelID}. textChannel permissions = ${channel.permissionsOf(state.client.user.id).json} err = ${e}. body = ${JSON.stringify(messageContent)}`);
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
    const author = (embedPayload.author == null || embedPayload.author) ? embedPayload.author : messageContext.author;
    return sendMessage(messageContext.textChannelID, messageContext.author.id, {
        embeds: [{
            color: embedPayload.color || EMBED_ERROR_COLOR,
            author: author ? {
                name: author.username,
                icon_url: author.avatarUrl,
            } : null,
            title: bold(embedPayload.title),
            description: embedPayload.description,
            footer: embedPayload.footerText ? {
                text: embedPayload.footerText,
            } : null,
            thumbnail: embedPayload.thumbnailUrl ? { url: embedPayload.thumbnailUrl } : { url: KmqImages.DEAD },
        }],
        components: embedPayload.components,
    });
}

/**
 * Sends an info embed with the specified title/description/footer text
 * @param messageContext - An object containing relevant parts of Eris.Message
 * @param embedPayload - What to include in the message
 * @param reply - Whether to reply to the given message
 */
export async function sendInfoMessage(messageContext: MessageContext, embedPayload: EmbedPayload, reply = false): Promise<Eris.Message<TextableChannel>> {
    if (embedPayload.description && embedPayload.description.length > 2048) {
        return sendErrorMessage(messageContext, { title: "Error", description: "Response message was too long, report this error to the KMQ help server" });
    }

    const author = (embedPayload.author == null || embedPayload.author) ? embedPayload.author : messageContext.author;
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

    return sendMessage(messageContext.textChannelID, messageContext.author.id, {
        embeds: [embed],
        messageReference: reply ? { messageID: messageContext.referencedMessageID, failIfNotExists: false } : null,
        components: embedPayload.components,
    });
}

/**
 * Sends an end of GameRound message displaying the correct answer as well as
 * other game related information
 * @param messageContext - An object to pass along relevant parts of Eris.Message
 * @param scoreboard - The GameSession's corresponding Scoreboard
 * @param gameRound - The GameSession's corresponding GameRound
 * @param songGuessed - Whether the song was guessed
 */
export async function sendEndRoundMessage(messageContext: MessageContext,
    scoreboard: Scoreboard,
    gameRound: GameRound,
    guessModeType: GuessModeType,
    playerRoundResults: Array<PlayerRoundResult>,
    timeRemaining?: number,
    uniqueSongCounter?: UniqueSongCounter) {
    const footer: Eris.EmbedFooterOptions = {
        text: "",
    };

    if (guessModeType === GuessModeType.ARTIST) {
        if (gameRound.artistAliases.length > 0) {
            footer.text += `Aliases: ${Array.from(gameRound.artistAliases).join(", ")}\n`;
        }
    } else {
        if (gameRound.songAliases.length > 0) {
            footer.text += `Aliases: ${Array.from(gameRound.songAliases).join(", ")}\n`;
        }
    }

    if (timeRemaining) {
        footer.text += timeRemaining > 0 ? `⏰ ${Math.ceil(timeRemaining)} minute(s) remaining` : "⏰ Time's up!";
    }

    const fact = Math.random() <= 0.05 ? getFact() : null;

    const correctGuess = playerRoundResults.length > 0;
    let correctDescription = "";
    if (correctGuess) {
        correctDescription += `**${playerRoundResults[0].player.tag}** ${playerRoundResults[0].streak >= 5 ? `(🔥 ${friendlyFormattedNumber(playerRoundResults[0].streak)}) ` : ""}guessed correctly (+${friendlyFormattedNumber(playerRoundResults[0].expGain)} EXP)`;
        if (playerRoundResults.length > 1) {
            const runnersUp = playerRoundResults.slice(1);
            let runnersUpDescription = runnersUp
                .map((x) => `${x.player.tag} (+${friendlyFormattedNumber(x.expGain)} EXP)`)
                .slice(0, 10)
                .join("\n");

            if (runnersUp.length >= 10) {
                runnersUpDescription += "\nand many others...";
            }

            correctDescription += `\n\n**Runners Up**\n${runnersUpDescription}`;
        }
    }

    const uniqueSongMessage = (uniqueSongCounter && uniqueSongCounter.uniqueSongsPlayed > 0) ? `\n${codeLine(`${friendlyFormattedNumber(uniqueSongCounter.uniqueSongsPlayed)}/${friendlyFormattedNumber(uniqueSongCounter.totalSongs)}`)} unique songs played.\n` : "";
    const useLargerScoreboard = scoreboard.getNumPlayers() > SCOREBOARD_FIELD_CUTOFF;
    const description = `${correctGuess ? correctDescription : "Nobody got it."}\n${uniqueSongMessage}${!scoreboard.isEmpty() && !useLargerScoreboard ? "\n**Scoreboard**" : ""}`;
    let fields: Array<{ name: string, value: string, inline: boolean }>;
    let roundResultIDs: Set<string>;
    if (scoreboard instanceof TeamScoreboard) {
        const teamScoreboard = scoreboard as TeamScoreboard;
        roundResultIDs = new Set(playerRoundResults.map((x) => teamScoreboard.getTeamOfPlayer(x.player.id).getID()));
    } else {
        roundResultIDs = new Set(playerRoundResults.map((x) => x.player.id));
    }

    if (useLargerScoreboard) {
        fields = scoreboard.getScoreboardEmbedThreeFields(MAX_SCOREBOARD_PLAYERS, roundResultIDs);
    } else {
        fields = scoreboard.getScoreboardEmbedFields(roundResultIDs);
    }

    if (fact) {
        fields.push({
            name: "__Did you know?__", value: fact, inline: false,
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

    await sendInfoMessage(messageContext, {
        color,
        title: `"${gameRound.songName}" (${gameRound.songYear}) - ${gameRound.artistName}`,
        description,
        thumbnailUrl: `https://img.youtube.com/vi/${gameRound.videoID}/hqdefault.jpg`,
        fields,
        footerText: footer ? footer.text : "",
        components: [
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 5,
                        label: "YouTube",
                        emoji: {
                            id: null,
                            name: "📽️",
                        },
                        url: `https://youtu.be/${gameRound.videoID}`,
                    },
                ],
            },
        ],
    }, correctGuess);
}

/**
 * Sends an embed displaying the currently selected GameOptions
 * @param message - The Message object
 * @param guildPreference - The corresponding GuildPreference
 * @param updatedOption - Specifies which GameOption was modified
 * @param footerText - The footer text
 */
export async function sendOptionsMessage(messageContext: MessageContext,
    guildPreference: GuildPreference,
    updatedOption?: { option: GameOption, reset: boolean },
    footerText?: string) {
    const totalSongs = await getSongCount(guildPreference);
    if (totalSongs === null) {
        sendErrorMessage(messageContext, { title: "Error retrieving song data", description: `Try again in a bit, or report this error to the official KMQ server found in \`${process.env.BOT_PREFIX}help\`.` });
        return;
    }

    const visibleLimitEnd = Math.min(totalSongs.countBeforeLimit, guildPreference.getLimitEnd());
    const visibleLimitStart = Math.min(totalSongs.countBeforeLimit, guildPreference.getLimitStart());
    const limit = guildPreference.getLimitStart() === 0 ? `${friendlyFormattedNumber(visibleLimitEnd)}` : `${getOrdinalNum(visibleLimitStart)} to ${getOrdinalNum(visibleLimitEnd)} (${friendlyFormattedNumber(totalSongs.count)} songs)`;

    // Store the VALUE of ,[option]: [VALUE] into optionStrings
    // Null optionStrings values are set to "Not set" below
    const optionStrings = {};
    optionStrings[GameOption.LIMIT] = `${limit} / ${friendlyFormattedNumber(totalSongs.countBeforeLimit)}`;
    optionStrings[GameOption.GROUPS] = guildPreference.isGroupsMode() ? guildPreference.getDisplayedGroupNames() : null;
    optionStrings[GameOption.GENDER] = guildPreference.getGender().join(", ");
    optionStrings[GameOption.CUTOFF] = `${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`;
    optionStrings[GameOption.ARTIST_TYPE] = guildPreference.getArtistType();
    optionStrings[GameOption.RELEASE_TYPE] = guildPreference.getReleaseType();
    optionStrings[GameOption.LANGUAGE_TYPE] = guildPreference.getLanguageType();
    optionStrings[GameOption.SUBUNIT_PREFERENCE] = guildPreference.getSubunitPreference();
    optionStrings[GameOption.OST_PREFERENCE] = guildPreference.getOstPreference();
    optionStrings[GameOption.MULTIGUESS] = guildPreference.getMultiGuessType();
    optionStrings[GameOption.SHUFFLE_TYPE] = guildPreference.getShuffleType();
    optionStrings[GameOption.SEEK_TYPE] = guildPreference.getSeekType();
    optionStrings[GameOption.GUESS_MODE_TYPE] = guildPreference.getGuessModeType();
    optionStrings[GameOption.SPECIAL_TYPE] = guildPreference.getSpecialType();
    optionStrings[GameOption.TIMER] = guildPreference.isGuessTimeoutSet() ? `${guildPreference.getGuessTimeout()} sec` : null;
    optionStrings[GameOption.DURATION] = guildPreference.isDurationSet() ? `${guildPreference.getDuration()} mins` : null;
    optionStrings[GameOption.EXCLUDE] = guildPreference.isExcludesMode() ? guildPreference.getDisplayedExcludesGroupNames() : null;
    optionStrings[GameOption.INCLUDE] = guildPreference.isIncludesMode() ? guildPreference.getDisplayedIncludesGroupNames() : null;

    const generateConflictingCommandEntry = ((commandValue: string, conflictingOption: string) => `${strikethrough(commandValue)} (\`${process.env.BOT_PREFIX}${conflictingOption}\` ${italicize("conflict")})`);

    const { gameSessions } = state;
    const isEliminationMode = gameSessions[messageContext.guildID] && gameSessions[messageContext.guildID].gameType === GameType.ELIMINATION;

    // Special case: ,goal is conflicting only when current game is elimination
    if (guildPreference.isGoalSet()) {
        optionStrings[GameOption.GOAL] = String(guildPreference.getGoal());
        if (isEliminationMode) {
            optionStrings[GameOption.GOAL] = generateConflictingCommandEntry(optionStrings[GameOption.GOAL], `play ${GameType.ELIMINATION}`);
        }
    }

    const gameOptionConflictCheckMap = [
        { conflictCheck: guildPreference.isGroupsMode.bind(guildPreference), gameOption: GameOption.GROUPS },
    ];

    // When an option is set that conflicts with others, visually show a conflict on those other options
    for (const gameOptionConflictCheck of gameOptionConflictCheckMap) {
        const doesConflict = gameOptionConflictCheck.conflictCheck();
        if (doesConflict) {
            for (const option of ConflictingGameOptions[gameOptionConflictCheck.gameOption]) {
                if (optionStrings[option]) {
                    optionStrings[option] = generateConflictingCommandEntry(optionStrings[option], GameOptionCommand[gameOptionConflictCheck.gameOption]);
                }
            }
        }
    }

    for (const option of Object.values(GameOption)) {
        optionStrings[option] = optionStrings[option] || italicize("Not set");
    }

    // Underline changed option
    if (updatedOption) {
        optionStrings[updatedOption.option] = underline(optionStrings[updatedOption.option]);
    }

    // Options excluded from embed fields since they are of higher importance (shown above them as part of the embed description)
    let priorityOptions = PriorityGameOption
        .map((option) => `${bold(process.env.BOT_PREFIX + GameOptionCommand[option])}: ${optionStrings[option]}`)
        .join("\n");

    priorityOptions = `Now playing the top ${bold(limit)} out of ${bold(String(friendlyFormattedNumber(totalSongs.countBeforeLimit)))} available songs from the following game options:\n\n${priorityOptions}`;

    const fieldOptions = Object.keys(GameOptionCommand).filter((option) => !PriorityGameOption.includes(option as GameOption));
    const ZERO_WIDTH_SPACE = "​";
    // Split non-priority options into three fields
    const fields = [
        {
            name: ZERO_WIDTH_SPACE,
            value: fieldOptions.slice(0, Math.ceil(fieldOptions.length / 3)).map((option) => `${bold(process.env.BOT_PREFIX + GameOptionCommand[option])}: ${optionStrings[option]}`).join("\n"),
            inline: true,
        },
        {
            name: ZERO_WIDTH_SPACE,
            value: fieldOptions.slice(Math.ceil(fieldOptions.length / 3), Math.ceil((2 * fieldOptions.length) / 3)).map((option) => `${bold(process.env.BOT_PREFIX + GameOptionCommand[option])}: ${optionStrings[option]}`).join("\n"),
            inline: true,
        },
        {
            name: ZERO_WIDTH_SPACE,
            value: fieldOptions.slice(Math.ceil((2 * fieldOptions.length) / 3)).map((option) => `${bold(process.env.BOT_PREFIX + GameOptionCommand[option])}: ${optionStrings[option]}`).join("\n"),
            inline: true,
        },
    ];

    if (updatedOption && updatedOption.reset) {
        footerText = `Looking for information on how to use a command? Check out '${process.env.BOT_PREFIX}help [command]' to learn more.`;
    }

    await sendInfoMessage(messageContext,
        {
            title: updatedOption === null ? "Options" : `${updatedOption.option} ${updatedOption.reset ? "reset" : "updated"}`,
            description: priorityOptions,
            fields,
            footerText,
            thumbnailUrl: KmqImages.LISTENING,
        }, true);
}

/**
 * Sends an embed displaying the winner of the session as well as the scoreboard
 * @param textChannel - The channel where the message should be delivered
 * @param gameSession - The GameSession that has ended
 */
export async function sendEndGameMessage(gameSession: GameSession) {
    const footerText = `${gameSession.getCorrectGuesses()}/${gameSession.getRoundsPlayed()} songs correctly guessed!`;
    if (gameSession.scoreboard.isEmpty()) {
        await sendInfoMessage(new MessageContext(gameSession.textChannelID), {
            color: EMBED_INFO_COLOR,
            title: "Nobody won",
            footerText,
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
        });
    } else {
        const winners = gameSession.scoreboard.getWinners();
        let fields: Array<{ name: string, value: string, inline: boolean }>;
        const useLargerScoreboard = gameSession.scoreboard.getNumPlayers() > SCOREBOARD_FIELD_CUTOFF;
        if (useLargerScoreboard) {
            fields = gameSession.scoreboard.getScoreboardEmbedThreeFields(MAX_SCOREBOARD_PLAYERS);
        } else {
            fields = gameSession.scoreboard.getScoreboardEmbedFields();
        }

        const endGameMessage: EndGameMessage = chooseWeightedRandom(await dbContext.kmq("end_game_messages").where("category", "=", Math.random() < 0.5 ? "kmq" : "game"));
        if (endGameMessage) {
            fields.push(
                {
                    name: endGameMessage.title,
                    value: endGameMessage.message,
                    inline: false,
                },
            );
        }

        await sendInfoMessage(new MessageContext(gameSession.textChannelID), {
            color: gameSession.gameType !== GameType.TEAMS && await userBonusIsActive(winners[0].id) ? EMBED_SUCCESS_BONUS_COLOR : EMBED_SUCCESS_COLOR,
            description: !useLargerScoreboard ? "**Scoreboard**" : null,
            thumbnailUrl: winners[0].getAvatarURL(),
            title: `🎉 ${gameSession.scoreboard.getWinnerMessage()} 🎉`,
            fields,
            footerText,
        });
    }
}

/**
 * Sends a paginated embed
 * @param message - The Message object
 * @param embeds - A list of embeds to paginate over
 */
export async function sendPaginationedEmbed(message: GuildTextableMessage, embeds: Array<Eris.EmbedOptions>, components?: Array<Eris.ActionRow>) {
    if (embeds.length > 1) {
        if ((await textPermissionsCheck(message.channel.id, message.guildID, message.author.id))) {
            return EmbedPaginator.createPaginationEmbed(message, embeds, { timeout: 60000 }, components);
        }

        return null;
    }

    return sendMessage(message.channel.id, message.author.id, { embeds: [embeds[0]], components });
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
    const botVoiceConnection = state.client.voiceConnections.get(message.guildID);
    if (!message.member.voiceState || !botVoiceConnection) {
        return false;
    }

    return message.member.voiceState.channelID === botVoiceConnection.channelID;
}

/**
 * @param message - The Message object
 * @returns the voice channel that the message's author is in
 */
export function getUserVoiceChannel(message: GuildTextableMessage): Eris.VoiceChannel {
    const voiceChannelID = message.member.voiceState.channelID;
    if (!voiceChannelID) return null;
    return state.client.getChannel(voiceChannelID) as Eris.VoiceChannel;
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
 * @param voiceChannelID - The voice channel to check
 * @returns the users in the voice channel, excluding bots
 */
export function getCurrentVoiceMembers(voiceChannelID: string): Array<Eris.Member> {
    return getVoiceChannel(voiceChannelID).voiceMembers.filter((x) => !x.bot);
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
    const voiceChannel = getUserVoiceChannel(message);
    const messageContext = MessageContext.fromMessage(message);
    const missingPermissions = REQUIRED_VOICE_PERMISSIONS.filter((permission) => !voiceChannel.permissionsOf(state.client.user.id).has(permission));
    if (missingPermissions.length > 0) {
        logger.warn(`${getDebugLogHeader(messageContext)} | Missing Voice Channel [${missingPermissions.join(", ")}] permissions`);
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
 * @param guildID - The guild ID
 * @returns whether the bot is alone 😔 ends the gameSession if it does
 */
export function checkBotIsAlone(guildID: string): boolean {
    const voiceConnection = state.client.voiceConnections.get(guildID);
    if (!voiceConnection || !voiceConnection.channelID) return true;
    const channel = state.client.getChannel(voiceConnection.channelID) as Eris.VoiceChannel;
    if (channel.voiceMembers.size === 0) return true;
    if (channel.voiceMembers.size === 1 && channel.voiceMembers.has(state.client.user.id)) {
        return true;
    }

    return false;
}

/** @returns the debug TextChannel */
export function getDebugChannel(): Eris.TextChannel {
    if (!process.env.DEBUG_SERVER_ID || !process.env.DEBUG_TEXT_CHANNEL_ID) return null;
    const debugGuild = state.client.guilds.get(process.env.DEBUG_SERVER_ID);
    if (!debugGuild) return null;
    return <Eris.TextChannel>debugGuild.channels.get(process.env.DEBUG_TEXT_CHANNEL_ID);
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

/**
 * @param message - The message
 * @returns the number of users required for a majority
 */
export function getMajorityCount(guildID: string): number {
    const voiceChannelID = state.client.voiceConnections.get(guildID)?.channelID;
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
export function sendDebugAlertWebhook(title: string, description: string, color: number, avatarUrl: string) {
    if (!process.env.ALERT_WEBHOOK_URL) return;
    axios.post(process.env.ALERT_WEBHOOK_URL, {
        embeds: [{
            title,
            description,
            color,
        }],
        username: "Kimiqo",
        avatar_url: avatarUrl,
    });
}
