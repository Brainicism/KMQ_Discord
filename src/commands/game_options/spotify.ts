import { IPCLogger } from "../../logger";
import {
    SPOTIFY_BASE_URL,
    SPOTIFY_SHORTHAND_BASE_URL,
    YOUTUBE_PLAYLIST_BASE_URL,
} from "../../constants";
import {
    clickableSlashCommand,
    friendlyFormattedNumber,
    isValidURL,
    italicize,
    standardDateFormat,
} from "../../helpers/utils";
import {
    generateEmbed,
    generateOptionsMessage,
    getDebugLogHeader,
    getInteractionValue,
    notifyOptionsGenerationError,
    sendErrorMessage,
    sendInfoMessage,
    sendMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import {
    getLocalizedArtistName,
    getLocalizedSongName,
} from "../../helpers/game_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LimitCommand from "./limit";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import SongSelector from "../../structures/song_selector";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { MatchedPlaylist } from "../../interfaces/matched_playlist";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "spotify";
const logger = new IPCLogger(COMMAND_NAME);

const enum SpotifyCommandAction {
    SET = "set",
    RESET = "reset",
    MATCHES = "matches",
}

export default class SpotifyCommand implements BaseCommand {
    aliases = ["playlist"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "playlist_url",
                type: "string" as const,
            },
        ],
    };

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: SpotifyCommandAction.SET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.spotify.help.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.spotify.help.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "playlist_url",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.spotify.help.interaction.playlistURL",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.spotify.help.interaction.playlistURL",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                        },
                    ],
                },
                {
                    name: SpotifyCommandAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "spotify" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "spotify" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
                {
                    name: SpotifyCommandAction.MATCHES,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.spotify.help.interaction.matches",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.spotify.help.interaction.matches",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "show_link",
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .BOOLEAN,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.spotify.help.interaction.matchesLink",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.spotify.help.interaction.matchesLink",
                                        ),
                                    }),
                                    {},
                                ),
                        },
                    ],
                },
            ],
        },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.spotify.help.description",
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    SpotifyCommandAction.SET,
                )} playlist_url:${SPOTIFY_BASE_URL}...`,
                explanation: i18n.translate(
                    guildID,
                    "command.spotify.help.example.playlistURL",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    SpotifyCommandAction.SET,
                )} playlist_url:${SPOTIFY_SHORTHAND_BASE_URL}...`,
                explanation: i18n.translate(
                    guildID,
                    "command.spotify.help.example.playlistURL",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    SpotifyCommandAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.spotify.help.example.reset",
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let playlistURL: string | undefined;
        if (
            parsedMessage.components.length > 0 &&
            isValidURL(parsedMessage.components[0])
        ) {
            playlistURL = parsedMessage.components[0];
        }

        if (playlistURL || parsedMessage.components.length === 0) {
            await SpotifyCommand.updateOption(
                MessageContext.fromMessage(message),
                playlistURL,
                undefined,
                playlistURL == null,
            );
        } else {
            logger.warn(
                `${getDebugLogHeader(
                    message,
                )} | Invalid URL in call. playlistURL = ${
                    parsedMessage.components[0]
                }`,
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                title: i18n.translate(
                    message.guildID,
                    "command.spotify.invalidURL.title",
                ),
                description: i18n.translate(
                    message.guildID,
                    "command.spotify.invalidURL.description",
                ),
            });
        }
    };

    static async updateOption(
        messageContext: MessageContext,
        playlistURL?: string,
        interaction?: Eris.CommandInteraction,
        reset = false,
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const guildPreference =
            await GuildPreference.getGuildPreference(guildID);

        const session = Session.getSession(guildID);
        if (reset) {
            await guildPreference.reset(GameOption.SPOTIFY_PLAYLIST_ID);
            await guildPreference.reset(GameOption.LIMIT);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Spotify playlist reset.`,
            );

            await sendOptionsMessage(
                session,
                messageContext,
                guildPreference,
                [{ option: GameOption.SPOTIFY_PLAYLIST_ID, reset }],
                false,
                undefined,
                undefined,
                interaction,
            );
            return;
        }

        if (!playlistURL) {
            logger.error("playlistURL unexpectedly undefined");
            return;
        }

        const isSpotifyFullURL = new RegExp(`^${SPOTIFY_BASE_URL}.+`).test(
            playlistURL,
        );

        const isSpotifyShorthandURL = new RegExp(
            `^${SPOTIFY_SHORTHAND_BASE_URL}.+`,
        ).test(playlistURL);

        const isYoutubePlaylistURL = new RegExp(
            `^${YOUTUBE_PLAYLIST_BASE_URL.replace("?", "\\?")}.+`,
        ).test(playlistURL);

        if (
            !isValidURL(playlistURL) ||
            (!isSpotifyFullURL &&
                !isSpotifyShorthandURL &&
                !isYoutubePlaylistURL)
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Invalid URL in updateOption. playlistURL = ${playlistURL}`,
            );

            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.spotify.invalidURL.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.spotify.invalidURL.description",
                    ),
                },
                interaction,
            );
            return;
        }

        let kmqPlaylistIdentifier: string;
        const matchPlaylistID = `${SPOTIFY_BASE_URL}([a-zA-Z0-9]+)`;
        try {
            if (isSpotifyFullURL) {
                kmqPlaylistIdentifier = `spotify|${
                    playlistURL.match(matchPlaylistID)![1]
                }`;
            } else if (isSpotifyShorthandURL) {
                const response = await fetch(playlistURL);
                const body = await response.text();
                kmqPlaylistIdentifier = `spotify|${
                    body.match(matchPlaylistID)![1]
                }`;
            } else {
                kmqPlaylistIdentifier = `youtube|${
                    playlistURL.match(
                        `${YOUTUBE_PLAYLIST_BASE_URL.replace("?", "\\?")}(.+)`,
                    )![1]
                }`;
            }
        } catch (err) {
            logger.error(
                `${getDebugLogHeader(
                    messageContext,
                )} | Failed to get playlist ID from playlist URL. playlistURL = ${playlistURL}. err = ${err}`,
            );

            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.spotify.invalidURL.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.spotify.invalidURL.description",
                    ),
                },
                interaction,
            );
            return;
        }

        let matchedPlaylist: MatchedPlaylist;
        if (session) {
            matchedPlaylist = (await session.songSelector.reloadSongs(
                guildPreference,
                kmqPlaylistIdentifier,
                true,
                messageContext,
                interaction,
            )) as MatchedPlaylist;
        } else {
            matchedPlaylist = (await new SongSelector().reloadSongs(
                guildPreference,
                kmqPlaylistIdentifier,
                true,
                messageContext,
                interaction,
            )) as MatchedPlaylist;
        }

        logger.info(
            `${getDebugLogHeader(messageContext)} | Matched ${
                matchedPlaylist.metadata.matchedSongsLength
            }/${matchedPlaylist.metadata.playlistLength} (${(
                (100.0 * matchedPlaylist.metadata.matchedSongsLength) /
                matchedPlaylist.metadata.playlistLength
            ).toFixed(2)}%) Spotify songs`,
        );

        if (matchedPlaylist.matchedSongs.length === 0) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        guildID,
                        "command.spotify.noMatches.title",
                    ),
                    description: i18n.translate(
                        guildID,
                        "command.spotify.noMatches.description",
                    ),
                },
                interaction,
            );

            return;
        }

        await guildPreference.setSpotifyPlaylistID(kmqPlaylistIdentifier);

        await LimitCommand.updateOption(
            messageContext,
            0,
            matchedPlaylist.metadata.matchedSongsLength,
            undefined,
            false,
        );

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Spotify playlist set to ${kmqPlaylistIdentifier}`,
        );

        let matchedDescription = i18n.translate(
            guildID,
            "command.spotify.matched.description",
            {
                matchedCount: friendlyFormattedNumber(
                    matchedPlaylist.matchedSongs.length,
                ),
                totalCount: friendlyFormattedNumber(
                    matchedPlaylist.metadata.playlistLength,
                ),
            },
        );

        if (matchedPlaylist.truncated) {
            matchedDescription += "\n\n";
            matchedDescription += italicize(
                i18n.translate(guildID, "command.spotify.matched.truncated"),
            );
        }

        await sendInfoMessage(messageContext, {
            title: i18n.translate(guildID, "command.spotify.matched.title", {
                playlistName: matchedPlaylist.metadata.playlistName,
            }),
            description: matchedDescription,
            url: playlistURL,
            thumbnailUrl: matchedPlaylist.metadata.thumbnailUrl ?? undefined,
        });

        if (interaction?.acknowledged) {
            const optionsEmbed = await generateOptionsMessage(
                session,
                messageContext,
                guildPreference,
                [{ option: GameOption.SPOTIFY_PLAYLIST_ID, reset }],
                false,
                undefined,
                undefined,
                interaction,
            );

            if (optionsEmbed) {
                await interaction.createFollowup({
                    embeds: [generateEmbed(messageContext, optionsEmbed)],
                });
            } else {
                await notifyOptionsGenerationError(messageContext, "spotify");
            }
        } else {
            await sendOptionsMessage(
                session,
                messageContext,
                guildPreference,
                [{ option: GameOption.SPOTIFY_PLAYLIST_ID, reset }],
                false,
                undefined,
                undefined,
                interaction,
            );
        }
    }

    static async sendMatchedSongsFile(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
        showLink: boolean,
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (!guildPreference.isPlaylist()) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        guildID,
                        "command.spotify.noPlaylistSet.title",
                    ),
                    description: i18n.translate(
                        guildID,
                        "command.spotify.noPlaylistSet.description",
                        {
                            spotifySet: clickableSlashCommand(
                                "spotify",
                                SpotifyCommandAction.SET,
                            ),
                        },
                    ),
                },
                interaction,
            );
            return;
        }

        const kmqPlaylistIdentifier =
            guildPreference.getKmqPlaylistID() as string;

        const playlist = await State.spotifyManager.getMatchedPlaylist(
            guildID,
            kmqPlaylistIdentifier,
            false,
            messageContext,
            interaction,
        );

        const locale = State.getGuildLocale(guildID);
        const unmatchedSongs = playlist.unmatchedSongs.map(
            (song, index) => `${index + 1}. ${song}`,
        );

        const matchedSongs = playlist.matchedSongs.map(
            (song, index) =>
                `${index + 1}. "${getLocalizedSongName(
                    song,
                    locale,
                )}" - ${getLocalizedArtistName(song, locale)}${
                    showLink ? ` (${song.youtubeLink})` : ""
                }`,
        );

        const attachments: Eris.AdvancedMessageContentAttachment[] = [];
        if (unmatchedSongs.length > 0) {
            attachments.push({
                filename: `kmq-playlist-unmatched-${kmqPlaylistIdentifier}-${standardDateFormat(
                    new Date(),
                )}.txt`,
                file: i18n.translate(
                    locale,
                    "command.spotify.fileFormat.unmatched",
                    {
                        playlistName: playlist.metadata.playlistName,
                        unmatchedSongs: unmatchedSongs.join("\n"),
                    },
                ),
            });
        }

        if (matchedSongs.length > 0) {
            attachments.push({
                filename: `kmq-playlist-matched-${kmqPlaylistIdentifier}-${standardDateFormat(
                    new Date(),
                )}.txt`,
                file: i18n.translate(
                    locale,
                    "command.spotify.fileFormat.matched",
                    {
                        playlistName: playlist.metadata.playlistName,
                        matchedSongs: matchedSongs.join("\n"),
                    },
                ),
            });
        }

        if (interaction.acknowledged) {
            await interaction.createFollowup({
                attachments,
            });
        } else {
            await sendMessage(
                messageContext.textChannelID,
                { attachments },
                undefined,
                interaction,
            );
        }
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        if (
            interactionName === SpotifyCommandAction.RESET ||
            interactionName === SpotifyCommandAction.SET
        ) {
            const playlistURL =
                interactionName === SpotifyCommandAction.SET
                    ? encodeURI(interactionOptions["playlist_url"])
                    : undefined;

            await SpotifyCommand.updateOption(
                messageContext,
                playlistURL,
                interaction,
                playlistURL == null,
            );
        } else if (interactionName === SpotifyCommandAction.MATCHES) {
            const showLink = interactionOptions["show_link"] ?? false;
            await SpotifyCommand.sendMatchedSongsFile(
                interaction,
                messageContext,
                showLink,
            );
        }
    }

    /**
     * @param kmqPlaylistIdentifier - Identifier containing either youtube/spotify followed by the playlist ID
     * @returns whether it is a Spotify playlist, and the parsed playlist ID
     */
    static parseKmqPlaylistIdentifier(kmqPlaylistIdentifier: string): {
        isSpotify: boolean;
        playlistId: string;
    } {
        const identifierComponents = kmqPlaylistIdentifier.split("|");
        if (identifierComponents.length === 1) {
            return {
                isSpotify: true,
                playlistId: identifierComponents[0],
            };
        }

        return {
            isSpotify: identifierComponents[0] === "spotify",
            playlistId: identifierComponents[1],
        };
    }
}
