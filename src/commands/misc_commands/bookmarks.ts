import * as Eris from "eris";
import { IPCLogger } from "../../logger.js";
import {
    chunkArray,
    containsHangul,
    discordDateFormat,
    truncatedString,
} from "../../helpers/utils.js";
import {
    clickableSlashCommand,
    getInteractionValue,
    localizedAutocompleteFormat,
    searchArtists,
    sendDeprecatedTextCommandMessage,
    sendPaginationedEmbed,
    tryAutocompleteInteractionAcknowledge,
    tryCreateInteractionErrorAcknowledgement,
} from "../../helpers/discord_utils.js";
import { getEmojisFromSongTags } from "../../helpers/game_utils.js";
import GameRound from "../../structures/game_round.js";
import LocaleType from "../../enums/locale_type.js";
import MessageContext from "../../structures/message_context.js";
import QueriedSongWithBookmarkDate from "../../structures/queried_song_with_bookmark_date.js";
import SongSelector from "../../structures/song_selector.js";
import State from "../../state.js";
import _ from "lodash";
import dbContext from "../../database_context.js";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type { EmbedOptions } from "eris";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type HelpDocumentation from "../../interfaces/help.js";
import type MatchedArtist from "../../interfaces/matched_artist.js";

const COMMAND_NAME = "bookmarks";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class BookmarksCommand implements BaseCommand {
    static ENTRIES_PER_PAGE = 10;
    static SONG_NAME = "song_name";
    static ARTIST_NAME = "artist_name";

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.bookmarks.help.description",
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    BookmarksCommand.SONG_NAME,
                )} ${BookmarksCommand.SONG_NAME}:pitapat`,
                explanation: i18n.translate(
                    guildID,
                    "command.bookmarks.help.example.song",
                    { song: "pitapat" },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    BookmarksCommand.ARTIST_NAME,
                )} ${BookmarksCommand.ARTIST_NAME}:ILLIT`,
                explanation: i18n.translate(
                    guildID,
                    "command.bookmarks.help.example.artist",
                    { artist: "ILLIT" },
                ),
            },
        ],
        priority: 500,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: BookmarksCommand.SONG_NAME,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.bookmarks.help.songName",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.bookmarks.help.songName",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: false,
                    autocomplete: true,
                },
                {
                    name: BookmarksCommand.ARTIST_NAME,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.bookmarks.help.artistName",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.bookmarks.help.artistName",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: false,
                    autocomplete: true,
                },
            ],
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        logger.warn("Text-based command not supported for bookmark");
        await sendDeprecatedTextCommandMessage(
            MessageContext.fromMessage(message),
        );
    };

    async sendBookmarkMessage(
        interaction: Eris.CommandInteraction,
        songName?: string,
        artistID?: number,
    ): Promise<void> {
        const guildID = interaction.guild?.id!;
        const locale = State.getGuildLocale(guildID);
        let bookmarkedSongQuery = dbContext.kmq
            .selectFrom("bookmarked_songs")
            .innerJoin(
                "available_songs",
                "available_songs.link",
                "bookmarked_songs.vlink",
            )
            .select([
                ...SongSelector.QueriedSongFields,
                "bookmarked_songs.bookmarked_at as bookmarkedAt",
            ])
            .where("user_id", "=", interaction.user!.id);

        if (songName) {
            bookmarkedSongQuery = bookmarkedSongQuery
                .where(({ or, eb }) =>
                    or([
                        eb(
                            "available_songs.song_name_en",
                            "like",
                            `%${songName}%`,
                        ),
                        eb(
                            "available_songs.song_name_ko",
                            "like",
                            `%${songName}%`,
                        ),
                    ]),
                )
                .orderBy((eb) => eb.fn("CHAR_LENGTH", ["song_name_en"]), "asc")
                .orderBy("bookmarked_songs.bookmarked_at", "desc");
        } else {
            bookmarkedSongQuery = bookmarkedSongQuery.orderBy(
                "bookmarked_songs.bookmarked_at",
                "desc",
            );
        }

        if (artistID) {
            bookmarkedSongQuery = bookmarkedSongQuery.where(
                "available_songs.id_artist",
                "=",
                artistID,
            );
        }

        const bookmarkedSongs = (await bookmarkedSongQuery.execute()).map(
            (x) => new QueriedSongWithBookmarkDate(x),
        );

        if (bookmarkedSongs.length === 0) {
            await tryCreateInteractionErrorAcknowledgement(
                interaction,
                i18n.translate(guildID, "command.bookmarks.results.title"),
                i18n.translate(
                    guildID,
                    "command.bookmarks.results.notFoundDescription",
                ),
            );

            return;
        }

        const songEmbeds = bookmarkedSongs.map((entry) => ({
            name: truncatedString(
                `**"${entry.getLocalizedSongName(
                    locale,
                )}"** - ${entry.getLocalizedArtistName(locale)}${getEmojisFromSongTags(entry)} (${discordDateFormat(entry.bookmarkedAt, "d")})`,
                100,
            ),
            value: `https://youtu.be/${entry.youtubeLink}`,
        }));

        const embedFieldSubsets = chunkArray(
            songEmbeds,
            BookmarksCommand.ENTRIES_PER_PAGE,
        );

        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                title: i18n.translate(
                    guildID,
                    "command.bookmarks.results.title",
                ),
                description: i18n.translate(
                    guildID,
                    "command.bookmarks.results.successDescription",
                ),
                fields: embedFieldsSubset,
            }),
        );

        await sendPaginationedEmbed(interaction, embeds);
    }

    /**
     * @param interaction - The interaction
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        const songName =
            interactionData.interactionOptions[BookmarksCommand.SONG_NAME];

        const artistName =
            interactionData.interactionOptions[BookmarksCommand.ARTIST_NAME];

        let artistID: number | undefined;
        if (artistName) {
            const matchingArtist =
                State.artistToEntry[
                    GameRound.normalizePunctuationInName(artistName)
                ];

            if (matchingArtist) {
                artistID = matchingArtist.id;
            }
        }

        await this.sendBookmarkMessage(interaction, songName, artistID);
    }

    static async processAutocompleteInteraction(
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

        const lowercaseUserInput =
            GameRound.normalizePunctuationInName(focusedVal);

        const showHangul =
            containsHangul(lowercaseUserInput) ||
            (State.getGuildLocale(interaction.guild?.id as string) ===
                LocaleType.KO &&
                lowercaseUserInput.length === 0);

        if (focusedKey === BookmarksCommand.SONG_NAME) {
            const artistName =
                interactionData.interactionOptions[
                    BookmarksCommand.ARTIST_NAME
                ];

            let artistID: number | undefined;
            if (artistName) {
                artistID =
                    State.artistToEntry[
                        GameRound.normalizePunctuationInName(artistName)
                    ]?.id;
            }

            await tryAutocompleteInteractionAcknowledge(
                interaction,
                localizedAutocompleteFormat(
                    _.uniqBy(
                        Object.values(State.songLinkToEntry).filter(
                            (x) =>
                                (!artistID || artistID === x.artistID) &&
                                GameRound.normalizePunctuationInName(
                                    (showHangul && x.hangulName) || x.name,
                                ).startsWith(lowercaseUserInput),
                        ),
                        (x) => x.name.trim().toLowerCase(),
                    ),
                    showHangul,
                ),
            );
        } else if (focusedKey === BookmarksCommand.ARTIST_NAME) {
            const enteredSongName =
                interactionData.interactionOptions[BookmarksCommand.SONG_NAME];

            let matchingArtists: Array<MatchedArtist> = [];
            if (!enteredSongName) {
                matchingArtists = searchArtists(lowercaseUserInput, []);
            } else {
                // only return artists that have a song that matches the entered one
                const cleanEnteredSongName =
                    GameRound.normalizePunctuationInName(enteredSongName);

                const matchingSongs = Object.values(
                    State.songLinkToEntry,
                ).filter(
                    (x) =>
                        x.name.startsWith(cleanEnteredSongName) ||
                        x.hangulName?.startsWith(cleanEnteredSongName),
                );

                const matchingSongArtistIDs = matchingSongs.map(
                    (x) => x.artistID,
                );

                matchingArtists = _.uniq(
                    Object.values(State.artistToEntry)
                        .filter((x) => matchingSongArtistIDs.includes(x.id))
                        .filter((x) =>
                            (showHangul && x.hangulName ? x.hangulName : x.name)
                                .toLowerCase()
                                .startsWith(lowercaseUserInput),
                        ),
                );
            }

            await tryAutocompleteInteractionAcknowledge(
                interaction,
                localizedAutocompleteFormat(matchingArtists, showHangul),
            );
        }
    }
}
