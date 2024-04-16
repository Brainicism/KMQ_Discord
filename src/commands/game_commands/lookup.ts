import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import {
    chunkArray,
    containsHangul,
    friendlyFormattedDate,
    friendlyFormattedNumber,
    isValidURL,
    truncatedString,
} from "../../helpers/utils";
import {
    clickableSlashCommand,
    getAllClickableSlashCommands,
    getDebugLogHeader,
    getInteractionValue,
    localizedAutocompleteFormat,
    searchArtists,
    sendErrorMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
    tryAutocompleteInteractionAcknowledge,
} from "../../helpers/discord_utils";
import { getEmojisFromSongTags } from "../../helpers/game_utils";
import { getVideoID, validateID } from "@distube/ytdl-core";
import { sendValidationErrorMessage } from "../../helpers/validate";
import Eris from "eris";
import GameRound from "../../structures/game_round";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import QueriedSong from "../../structures/queried_song";
import SongSelector from "../../structures/song_selector";
import State from "../../state";
import _ from "lodash";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import type { CommandInteraction, EmbedOptions } from "eris";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type MatchedArtist from "src/interfaces/matched_artist";

const COMMAND_NAME = "lookup";
const logger = new IPCLogger(COMMAND_NAME);

export default class LookupCommand implements BaseCommand {
    static ENTRIES_PER_PAGE = 10;

    static SONG_NAME = "song_name";
    static SONG_LINK = "song_link";
    static ARTIST_NAME = "artist_name";
    aliases = ["songinfo", "songlookup"];
    validations = {
        minArgCount: 1,
        arguments: [],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.lookup.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    LookupCommand.SONG_NAME,
                )} ${LookupCommand.SONG_NAME}:love dive`,
                explanation: i18n.translate(
                    guildID,
                    "command.lookup.help.example.song",
                    { song: "Love Dive", artist: "IVE" },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    LookupCommand.SONG_LINK,
                )} ${LookupCommand.SONG_LINK}:https://www.youtube.com/watch?v=4TWR90KJl84`,
                explanation: i18n.translate(
                    guildID,
                    "command.lookup.help.example.song",
                    { song: "Next Level", artist: "Aespa" },
                ),
            },
        ],
        priority: 40,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: LookupCommand.SONG_NAME,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.lookup.help.interaction.byName.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.lookup.help.interaction.byName.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: LookupCommand.SONG_NAME,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.lookup.help.interaction.byName.field.song",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.lookup.help.interaction.byName.field.song",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                        {
                            name: LookupCommand.ARTIST_NAME,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.lookup.help.interaction.byName.field.artist",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.lookup.help.interaction.byName.field.artist",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                    ],
                },
                {
                    name: LookupCommand.SONG_LINK,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.lookup.help.interaction.byLink.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.lookup.help.interaction.byLink.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: LookupCommand.SONG_LINK,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.lookup.help.interaction.byLink.field",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.lookup.help.interaction.byLink.field",
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
            ],
        },
    ];

    call = async ({ parsedMessage, message }: CommandArgs): Promise<void> => {
        await this.lookupSong(message, parsedMessage.argument);
    };

    async lookupSong(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
        arg: string,
        artistID?: number,
    ): Promise<void> {
        let linkOrName = arg || "";
        if (linkOrName.startsWith("<") && linkOrName.endsWith(">")) {
            // Trim <> if user didn't want to show YouTube embed
            linkOrName = linkOrName.slice(1, -1);
        }

        if (
            linkOrName.startsWith("youtube.com") ||
            linkOrName.startsWith("youtu.be")
        ) {
            // ytdl::getVideoID() requires URLs start with "https://"
            linkOrName = `https://${linkOrName}`;
        }

        const guildID = messageOrInteraction.guildID as string;
        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member!.id),
            messageOrInteraction.guildID as string,
        );

        const locale = State.getGuildLocale(guildID as string);

        // attempt to look up by video ID
        if (isValidURL(linkOrName) || validateID(linkOrName)) {
            let videoID: string;

            try {
                videoID = getVideoID(linkOrName);
            } catch {
                await sendValidationErrorMessage(
                    messageContext,
                    i18n.translate(
                        guildID,
                        "command.lookup.validation.invalidYouTubeID",
                    ),
                    arg,
                    getAllClickableSlashCommands(COMMAND_NAME),
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Invalid YouTube ID passed. arg = ${linkOrName}.`,
                );
                return;
            }

            if (
                !(await LookupCommand.lookupByYoutubeID(
                    messageOrInteraction,
                    videoID,
                    locale,
                ))
            ) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            guildID,
                            "command.lookup.notFound.title",
                        ),
                        description: i18n.translate(
                            guildID,
                            "command.lookup.notFound.description",
                        ),
                        thumbnailUrl: KmqImages.DEAD,
                    },
                    messageOrInteraction instanceof Eris.CommandInteraction
                        ? messageOrInteraction
                        : undefined,
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Could not find song by videoID. videoID = ${videoID}.`,
                );
            }
        } else if (
            // lookup by song name
            !(await LookupCommand.lookupBySongName(
                messageOrInteraction,
                linkOrName,
                locale,
                artistID,
            ))
        ) {
            await sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        guildID,
                        "command.lookup.songNameSearchResult.title",
                    ),
                    description: i18n.translate(
                        guildID,
                        "command.lookup.songNameSearchResult.notFoundDescription",
                    ),
                },
                false,
                undefined,
                [],
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : undefined,
            );

            logger.info(
                `Could not find song by song name. songName = ${linkOrName}`,
            );
        }
    }

    /**
     * @param interaction - The interaction
     * @param _messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: CommandInteraction,
        _messageContext: MessageContext,
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        if (interactionData.interactionName === LookupCommand.SONG_LINK) {
            await this.lookupSong(
                interaction,
                interactionData.interactionOptions[LookupCommand.SONG_LINK],
            );
        } else if (
            interactionData.interactionName === LookupCommand.SONG_NAME
        ) {
            const songName =
                interactionData.interactionOptions[LookupCommand.SONG_NAME];

            const artistName =
                interactionData.interactionOptions[LookupCommand.ARTIST_NAME];

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

            await this.lookupSong(interaction, songName, artistID);
        }
    }

    static getDaisukiLink(id: number, isMV: boolean): string {
        if (isMV) {
            return `https://kpop.daisuki.com.br/mv.html?id=${id}`;
        }

        return `https://kpop.daisuki.com.br/audio_videos.html?playid=${id}`;
    }

    static async lookupByYoutubeID(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
        videoID: string,
        locale: LocaleType,
    ): Promise<boolean> {
        const guildID = messageOrInteraction.guildID as string;
        const kmqSongEntry = await SongSelector.getSongByLink(videoID);
        const daisukiEntry = await dbContext.kpopVideos
            .selectFrom("app_kpop")
            .select([
                "name",
                "kname",
                "publishedon",
                "alias",
                "views",
                "id_artist",
                "id",
                "tags",
            ])
            .where("vlink", "=", videoID)
            .executeTakeFirst();

        if (!daisukiEntry) {
            // maybe it was falsely parsed as video ID? fallback to song name lookup
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            const found = await LookupCommand.lookupBySongName(
                messageOrInteraction,
                videoID,
                locale,
            );

            if (found) {
                logger.info(
                    `Lookup succeeded through fallback lookup for: ${videoID}`,
                );
                return true;
            }

            return false;
        }

        const daisukiLink = LookupCommand.getDaisukiLink(
            daisukiEntry.id,
            !!daisukiEntry,
        );

        let description: string;
        let songName: string;
        let artistName: string;
        const songAliases: string[] = [];
        const artistAliases: string[] = [];
        const tags: string = getEmojisFromSongTags(daisukiEntry);
        let views: number;
        let publishDate: Date;
        let songDuration: string | null = null;
        let includedInOptions = false;
        const isKorean = locale === LocaleType.KO;

        if (kmqSongEntry) {
            description = i18n.translate(guildID, "command.lookup.inKMQ", {
                link: daisukiLink,
            });
            songName = kmqSongEntry.getLocalizedSongName(locale);
            artistName = kmqSongEntry.getLocalizedArtistName(locale);

            songAliases.push(...(State.aliases.song[videoID] ?? []));
            artistAliases.push(
                ...(State.aliases.artist[kmqSongEntry.artistName] ?? []),
            );

            if (isKorean) {
                songAliases.push(kmqSongEntry.songName);
                artistAliases.push(kmqSongEntry.artistName);
            } else {
                if (kmqSongEntry.hangulSongName) {
                    songAliases.push(kmqSongEntry.hangulSongName);
                }

                if (kmqSongEntry.hangulArtistName) {
                    artistAliases.push(kmqSongEntry.hangulArtistName);
                }
            }

            views = kmqSongEntry.views;
            publishDate = kmqSongEntry.publishDate;

            const durationInSeconds = (
                await dbContext.kmq
                    .selectFrom("cached_song_duration")
                    .select("duration")
                    .where("vlink", "=", videoID)
                    .executeTakeFirst()
            )?.duration;

            // duration in minutes and seconds
            if (durationInSeconds) {
                const minutes = Math.floor(durationInSeconds / 60);
                const seconds = durationInSeconds % 60;
                songDuration = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
            }

            const guildPreference =
                await GuildPreference.getGuildPreference(guildID);

            await guildPreference.songSelector.reloadSongs();
            includedInOptions = [
                ...guildPreference.songSelector.getSongs().songs,
            ]
                .map((x) => x.youtubeLink)
                .includes(videoID);

            logger.info(
                `${getDebugLogHeader(
                    messageOrInteraction,
                )} | KMQ song lookup. videoID = ${videoID}. Included in options = ${includedInOptions}.`,
            );
        } else {
            description = i18n.translate(guildID, "command.lookup.notInKMQ", {
                link: daisukiLink,
            });

            songName =
                daisukiEntry.kname && isKorean
                    ? daisukiEntry.kname
                    : daisukiEntry.name;

            const artistNameResult = await dbContext.kpopVideos
                .selectFrom("app_kpop_group_safe")
                .select(["name", "kname"])
                .where("id", "=", daisukiEntry.id_artist)
                .executeTakeFirst();

            if (!artistNameResult) {
                const errMsg = `Result of artist lookup in app_kpop_group unexpected null for artist: ${daisukiEntry.id_artist}`;
                logger.error(errMsg);
                throw new Error(errMsg);
            }

            artistName =
                artistNameResult.kname && isKorean
                    ? artistNameResult.kname
                    : artistNameResult.name;

            if (daisukiEntry.alias) {
                songAliases.push(...daisukiEntry.alias.split(";"));
            }

            artistAliases.push(
                ...(State.aliases.artist[artistNameResult.name] ?? []),
            );

            if (isKorean) {
                songAliases.push(daisukiEntry.name);
                artistAliases.push(artistNameResult.name);
            } else {
                if (daisukiEntry.kname) {
                    songAliases.push(daisukiEntry.kname);
                }

                if (artistNameResult.kname) {
                    artistAliases.push(artistNameResult.kname);
                }
            }

            views = daisukiEntry.views;
            publishDate = new Date(daisukiEntry.publishedon);

            logger.info(
                `${getDebugLogHeader(
                    messageOrInteraction,
                )} | Non-KMQ song lookup. videoID = ${videoID}.`,
            );
        }

        const viewsString = i18n.translate(guildID, "misc.views");

        const fields = [
            {
                name: _.capitalize(viewsString),
                value: friendlyFormattedNumber(views),
            },
            {
                name: i18n.translate(guildID, "misc.releaseDate"),
                value: friendlyFormattedDate(publishDate, guildID),
            },
            {
                name: i18n.translate(guildID, "misc.songAliases"),
                value:
                    songAliases.join(", ") ||
                    i18n.translate(guildID, "misc.none"),
            },
            {
                name: i18n.translate(guildID, "misc.artistAliases"),
                value:
                    artistAliases.join(", ") ||
                    i18n.translate(guildID, "misc.none"),
            },
        ];

        if (kmqSongEntry) {
            fields.push(
                {
                    name: i18n.translate(guildID, "misc.duration"),
                    value:
                        songDuration ||
                        i18n.translate(guildID, "misc.notApplicable"),
                },
                {
                    name: i18n.translate(
                        guildID,
                        "command.lookup.inCurrentGameOptions",
                    ),
                    value: i18n.translate(
                        guildID,
                        includedInOptions ? "misc.yes" : "misc.no",
                    ),
                },
            );
        }

        const songMetadata = await dbContext.kmq
            .selectFrom("song_metadata")
            .select(["correct_guesses", "rounds_played"])
            .where("vlink", "=", videoID)
            .executeTakeFirst();

        if (songMetadata && songMetadata.rounds_played > 0) {
            const guessRate = (
                (100.0 * songMetadata.correct_guesses) /
                songMetadata.rounds_played
            ).toFixed(2);

            fields.push({
                name: i18n.translate(guildID, "misc.guessRate"),
                value: `${guessRate}% (${songMetadata.correct_guesses}/${songMetadata.rounds_played})`,
            });
        }

        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member!.id),
            messageOrInteraction.guildID as string,
        );

        await sendInfoMessage(
            messageContext,
            {
                title: `"${songName}" - ${artistName}${tags}`,
                url: `https://youtu.be/${videoID}`,
                description,
                thumbnailUrl: `https://img.youtube.com/vi/${videoID}/hqdefault.jpg`,
                fields: fields.map((x) => ({
                    name: x.name,
                    value: x.value,
                    inline: true,
                })),
            },
            false,
            undefined,
            [],
            messageOrInteraction instanceof Eris.CommandInteraction
                ? messageOrInteraction
                : undefined,
        );

        return true;
    }

    static async lookupBySongName(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
        songName: string,
        locale: LocaleType,
        artistID?: number,
    ): Promise<boolean> {
        let kmqSongEntriesQuery = dbContext.kmq
            .selectFrom("available_songs")
            .select(SongSelector.QueriedSongFields)
            .limit(100);

        if (songName !== "") {
            kmqSongEntriesQuery = kmqSongEntriesQuery
                .where(({ or, eb }) =>
                    or([
                        eb("song_name_en", "like", `%${songName}%`),
                        eb("song_name_ko", "like", `%${songName}%`),
                    ]),
                )
                .orderBy((eb) => eb.fn("CHAR_LENGTH", ["song_name_en"]), "asc")
                .orderBy("views", "desc");
        } else {
            kmqSongEntriesQuery = kmqSongEntriesQuery.orderBy(
                "publishedon",
                "desc",
            );
        }

        if (artistID) {
            kmqSongEntriesQuery = kmqSongEntriesQuery.where(
                "id_artist",
                "=",
                artistID,
            );
        }

        const kmqSongEntries = (await kmqSongEntriesQuery.execute()).map(
            (x) => new QueriedSong(x),
        );

        if (kmqSongEntries.length === 0) {
            return false;
        }

        if (kmqSongEntries.length === 1) {
            return LookupCommand.lookupByYoutubeID(
                messageOrInteraction,
                kmqSongEntries[0]!.youtubeLink,
                locale,
            );
        }

        const songEmbeds = kmqSongEntries.map((entry) => ({
            name: truncatedString(
                `**"${entry.getLocalizedSongName(
                    locale,
                )}"** - ${entry.getLocalizedArtistName(locale)}${getEmojisFromSongTags(entry)}`,
                100,
            ),
            value: `https://youtu.be/${entry.youtubeLink}`,
        }));

        const embedFieldSubsets = chunkArray(
            songEmbeds,
            LookupCommand.ENTRIES_PER_PAGE,
        );

        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                title: i18n.translate(
                    messageOrInteraction.guildID as string,
                    "command.lookup.songNameSearchResult.title",
                ),
                description: i18n.translate(
                    messageOrInteraction.guildID as string,
                    "command.lookup.songNameSearchResult.successDescription",
                ),
                fields: embedFieldsSubset,
            }),
        );

        await sendPaginationedEmbed(messageOrInteraction, embeds);
        return true;
    }

    /**
     * Handles showing suggested song names as the user types for the lookup slash command
     * @param interaction - The interaction with intermediate typing state
     */
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

        const showPopular = lowercaseUserInput.length < 2;
        const showHangul =
            containsHangul(lowercaseUserInput) ||
            (State.getGuildLocale(interaction.guildID as string) ===
                LocaleType.KO &&
                showPopular);

        if (focusedKey === LookupCommand.SONG_NAME) {
            const artistName =
                interactionData.interactionOptions[LookupCommand.ARTIST_NAME];

            let artistID: number | undefined;
            if (artistName) {
                artistID =
                    State.artistToEntry[
                        GameRound.normalizePunctuationInName(artistName)
                    ]?.id;
            }

            if (showPopular) {
                await tryAutocompleteInteractionAcknowledge(
                    interaction,
                    localizedAutocompleteFormat(
                        _.uniqBy(
                            Object.values(
                                artistID
                                    ? State.songLinkToEntry
                                    : State.newSongs,
                            ).filter(
                                (x) => !artistID || artistID === x.artistID,
                            ),
                            (x) => x.name.trim().toLowerCase(),
                        ),
                        showHangul,
                    ),
                );
            } else {
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
            }
        } else if (focusedKey === LookupCommand.ARTIST_NAME) {
            const enteredSongName =
                interactionData.interactionOptions[LookupCommand.SONG_NAME];

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
