import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import {
    chunkArray,
    containsHangul,
    friendlyFormattedDate,
    friendlyFormattedNumber,
    isValidURL,
} from "../../helpers/utils";
import { cleanSongName } from "../../structures/game_round";
import {
    getDebugLogHeader,
    getInteractionValue,
    localizedAutocompleteFormat,
    searchArtists,
    sendErrorMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
    tryAutocompleteInteractionAcknowledge,
} from "../../helpers/discord_utils";
import {
    getLocalizedArtistName,
    getLocalizedSongName,
    isPremiumRequest,
} from "../../helpers/game_utils";
import { getVideoID, validateID } from "ytdl-core";
import { sendValidationErrorMessage } from "../../helpers/validate";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import SongSelector from "../../structures/song_selector";
import State from "../../state";
import _ from "lodash";
import dbContext from "../../database_context";
import type { CommandInteraction, EmbedOptions } from "eris";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type MatchedArtist from "src/interfaces/matched_artist";
import type QueriedSong from "../../interfaces/queried_song";

const logger = new IPCLogger("lookup");

const getDaisukiLink = (id: string, isMV: boolean): string => {
    if (isMV) {
        return `https://kpop.daisuki.com.br/mv.html?id=${id}`;
    }

    return `https://kpop.daisuki.com.br/audio_videos.html?playid=${id}`;
};

async function lookupByYoutubeID(
    messageOrInteraction: GuildTextableMessage | CommandInteraction,
    videoID: string,
    locale: LocaleType
): Promise<boolean> {
    const guildID = messageOrInteraction.guildID;
    const kmqSongEntry: QueriedSong = await dbContext
        .kmq("available_songs")
        .select(SongSelector.getQueriedSongFields())
        .where("link", videoID)
        .first();

    const daisukiEntry = await dbContext
        .kpopVideos("app_kpop")
        .where("vlink", videoID)
        .first();

    if (!daisukiEntry) {
        // maybe it was falsely parsed as video ID? fallback to song name lookup
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const found = await lookupBySongName(
            messageOrInteraction,
            videoID,
            locale
        );

        if (found) {
            logger.info(
                `Lookup succeeded through fallback lookup for: ${videoID}`
            );
            return true;
        }

        return false;
    }

    const daisukiLink = getDaisukiLink(daisukiEntry.id, !!daisukiEntry);

    let description: string;
    let songName: string;
    let artistName: string;
    let songAliases: string;
    let artistAliases: string;
    let views: number;
    let publishDate: Date;
    let songDuration: string;
    let includedInOptions = false;

    if (kmqSongEntry) {
        description = LocalizationManager.localizer.translate(
            guildID,
            "command.lookup.inKMQ",
            { link: daisukiLink }
        );
        songName = getLocalizedSongName(kmqSongEntry, locale);
        artistName = getLocalizedArtistName(kmqSongEntry, locale);
        songAliases = State.aliases.song[videoID]?.join(", ");
        artistAliases =
            State.aliases.artist[kmqSongEntry.artistName]?.join(", ");
        views = kmqSongEntry.views;
        publishDate = kmqSongEntry.publishDate;

        const durationInSeconds = (
            await dbContext
                .kmq("cached_song_duration")
                .where("vlink", videoID)
                .first()
        )?.duration;

        // duration in minutes and seconds
        if (durationInSeconds) {
            const minutes = Math.floor(durationInSeconds / 60);
            const seconds = durationInSeconds % 60;
            songDuration = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
        }

        const session = Session.getSession(guildID);
        includedInOptions = [
            ...(
                await SongSelector.getFilteredSongList(
                    await GuildPreference.getGuildPreference(guildID),
                    await isPremiumRequest(
                        session,
                        messageOrInteraction.member.id
                    )
                )
            ).songs,
        ]
            .map((x) => x.youtubeLink)
            .includes(videoID);

        logger.info(
            `${getDebugLogHeader(
                messageOrInteraction
            )} | KMQ song lookup. videoID = ${videoID}. Included in options = ${includedInOptions}.`
        );
    } else {
        description = LocalizationManager.localizer.translate(
            guildID,
            "command.lookup.notInKMQ",
            { link: daisukiLink }
        );
        const isKorean = locale === LocaleType.KO;
        songName =
            daisukiEntry.kname && isKorean
                ? daisukiEntry.kname
                : daisukiEntry.name;

        const artistNameQuery = await dbContext
            .kpopVideos("app_kpop_group")
            .select("name", "kname")
            .where("id", daisukiEntry.id_artist)
            .first();

        artistName =
            artistNameQuery.kname && isKorean
                ? artistNameQuery.kname
                : artistNameQuery.name;

        songAliases = daisukiEntry.alias.replaceAll(";", ", ");
        songAliases += songAliases
            ? `, ${daisukiEntry.kname}`
            : daisukiEntry.kname;

        artistAliases = State.aliases.artist[artistNameQuery.name]?.join(", ");

        views = daisukiEntry.views;
        publishDate = new Date(daisukiEntry.publishedon);

        logger.info(
            `${getDebugLogHeader(
                messageOrInteraction
            )} | Non-KMQ song lookup. videoID = ${videoID}.`
        );
    }

    const viewsString = LocalizationManager.localizer.translate(
        guildID,
        "misc.views"
    );

    const fields = [
        {
            name: viewsString[0].toUpperCase() + viewsString.slice(1),
            value: friendlyFormattedNumber(views),
        },
        {
            name: LocalizationManager.localizer.translate(
                guildID,
                "misc.releaseDate"
            ),
            value: friendlyFormattedDate(publishDate, guildID),
        },
        {
            name: LocalizationManager.localizer.translate(
                guildID,
                "misc.songAliases"
            ),
            value:
                songAliases ||
                LocalizationManager.localizer.translate(guildID, "misc.none"),
        },
        {
            name: LocalizationManager.localizer.translate(
                guildID,
                "misc.artistAliases"
            ),
            value:
                artistAliases ||
                LocalizationManager.localizer.translate(guildID, "misc.none"),
        },
    ];

    if (kmqSongEntry) {
        fields.push(
            {
                name: LocalizationManager.localizer.translate(
                    guildID,
                    "misc.duration"
                ),
                value:
                    songDuration ||
                    LocalizationManager.localizer.translate(
                        guildID,
                        "misc.notApplicable"
                    ),
            },
            {
                name: LocalizationManager.localizer.translate(
                    guildID,
                    "command.lookup.inCurrentGameOptions"
                ),
                value: LocalizationManager.localizer.translate(
                    guildID,
                    includedInOptions ? "misc.yes" : "misc.no"
                ),
            }
        );
    }

    const messageContext = new MessageContext(
        messageOrInteraction.channel.id,
        new KmqMember(messageOrInteraction.member.id),
        messageOrInteraction.guildID
    );

    sendInfoMessage(
        messageContext,
        {
            title: `"${songName}" - ${artistName}`,
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
        null,
        [],
        messageOrInteraction instanceof Eris.CommandInteraction
            ? messageOrInteraction
            : null
    );

    return true;
}

async function lookupBySongName(
    messageOrInteraction: GuildTextableMessage | CommandInteraction,
    songName: string,
    locale: LocaleType,
    artistID?: number
): Promise<boolean> {
    let kmqSongEntriesQuery = dbContext
        .kmq("available_songs")
        .select(SongSelector.getQueriedSongFields())
        .limit(100);

    if (songName !== "") {
        kmqSongEntriesQuery = kmqSongEntriesQuery
            .where((qb) => {
                qb.whereILike("song_name_en", `%${songName}%`).orWhereILike(
                    "song_name_ko",
                    `%${songName}%`
                );
            })
            .orderByRaw("CHAR_LENGTH(song_name_en) ASC")
            .orderBy("views", "DESC");
    } else {
        kmqSongEntriesQuery = kmqSongEntriesQuery.orderBy(
            "publishedon",
            "DESC"
        );
    }

    if (artistID) {
        kmqSongEntriesQuery = kmqSongEntriesQuery.andWhere(
            "id_artist",
            artistID
        );
    }

    const kmqSongEntries = await kmqSongEntriesQuery;
    if (kmqSongEntries.length === 0) {
        return false;
    }

    if (kmqSongEntries.length === 1) {
        return lookupByYoutubeID(
            messageOrInteraction,
            kmqSongEntries[0].youtubeLink,
            locale
        );
    }

    const songEmbeds = kmqSongEntries.map((entry) => ({
        name: `**"${getLocalizedSongName(
            entry,
            locale
        )}"** - ${getLocalizedArtistName(entry, locale)}`,
        value: `https://youtu.be/${entry.youtubeLink}`,
    }));

    const embedFieldSubsets = chunkArray(songEmbeds, 5);
    const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
        (embedFieldsSubset) => ({
            title: LocalizationManager.localizer.translate(
                messageOrInteraction.guildID,
                "command.lookup.songNameSearchResult.title"
            ),
            description: LocalizationManager.localizer.translate(
                messageOrInteraction.guildID,
                "command.lookup.songNameSearchResult.successDescription"
            ),
            fields: embedFieldsSubset,
        })
    );

    await sendPaginationedEmbed(messageOrInteraction, embeds);
    return true;
}

export default class LookupCommand implements BaseCommand {
    aliases = ["songinfo", "songlookup"];
    validations = {
        minArgCount: 1,
        arguments: [],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "lookup",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.lookup.help.description"
        ),
        usage: "/lookup song_name\nsong_name:[song]\nartist_name:[artist]\n\n/lookup song_link\nsong_link:{youtube_url}",
        examples: [
            {
                example: "`,lookup love dive`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.lookup.help.example.song",
                    { song: "Love Dive", artist: "IVE" }
                ),
            },
            {
                example:
                    "`,lookup https://www.youtube.com/watch?v=4TWR90KJl84`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.lookup.help.example.song",
                    { song: "Next Level", artist: "Aespa" }
                ),
            },
        ],
        priority: 40,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "lookup",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.lookup.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "song_name",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.lookup.help.interaction.byName.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "song_name",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.lookup.help.interaction.byName.field.song"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                        {
                            name: "artist_name",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.lookup.help.interaction.byName.field.artist"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                    ],
                },
                {
                    name: "song_link",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.lookup.help.interaction.byLink.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "song_link",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.lookup.help.interaction.byLink.field"
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
        await this.lookupSong(message, parsedMessage.components[0]);
    };

    async lookupSong(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
        arg: string,
        artistID?: number
    ): Promise<void> {
        let linkOrName = arg ?? "";
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

        const guildID = messageOrInteraction.guildID;
        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member.id),
            messageOrInteraction.guildID
        );

        const locale = State.getGuildLocale(guildID);

        // attempt to look up by video ID
        if (isValidURL(linkOrName) || validateID(linkOrName)) {
            let videoID: string = null;

            try {
                videoID = getVideoID(linkOrName);
            } catch {
                await sendValidationErrorMessage(
                    messageContext,
                    LocalizationManager.localizer.translate(
                        guildID,
                        "command.lookup.validation.invalidYouTubeID"
                    ),
                    arg,
                    this.help(guildID).usage
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Invalid YouTube ID passed. arg = ${linkOrName}.`
                );
                return;
            }

            if (
                !(await lookupByYoutubeID(
                    messageOrInteraction,
                    videoID,
                    locale
                ))
            ) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            guildID,
                            "command.lookup.notFound.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            guildID,
                            "command.lookup.notFound.description"
                        ),
                        thumbnailUrl: KmqImages.DEAD,
                    },
                    messageOrInteraction instanceof Eris.CommandInteraction
                        ? messageOrInteraction
                        : null
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Could not find song by videoID. videoID = ${videoID}.`
                );
            }
        } else if (
            // lookup by song name
            !(await lookupBySongName(
                messageOrInteraction,
                linkOrName,
                locale,
                artistID
            ))
        ) {
            await sendInfoMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        guildID,
                        "command.lookup.songNameSearchResult.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        guildID,
                        "command.lookup.songNameSearchResult.notFoundDescription"
                    ),
                },
                false,
                null,
                [],
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : null
            );

            logger.info(
                `Could not find song by song name. songName = ${linkOrName}`
            );
        }
    }

    /**
     * @param interaction - The interaction
     * @param _messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: CommandInteraction,
        _messageContext: MessageContext
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        if (interactionData.interactionName === "song_link") {
            await this.lookupSong(
                interaction,
                interactionData.interactionOptions["song_link"]
            );
        } else if (interactionData.interactionName === "song_name") {
            const songName = interactionData.interactionOptions["song_name"];

            const artistName =
                interactionData.interactionOptions["artist_name"];

            let artistID: number;
            if (artistName) {
                const matchingArtist =
                    State.artistToEntry[artistName.toLowerCase()];

                if (matchingArtist) {
                    artistID = matchingArtist.id;
                }
            }

            await this.lookupSong(interaction, songName, artistID);
        }
    }

    /**
     * Handles showing suggested song names as the user types for the lookup slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        const focusedKey = interactionData.focusedKey;
        const focusedVal = interactionData.interactionOptions[focusedKey];

        const lowercaseUserInput = focusedVal.toLowerCase();
        const showHangul =
            containsHangul(lowercaseUserInput) ||
            State.getGuildLocale(interaction.guildID) === LocaleType.KO;

        if (focusedKey === "song_name") {
            const artistName =
                interactionData.interactionOptions["artist_name"];

            let artistID: number;
            if (artistName) {
                artistID = State.artistToEntry[artistName.toLowerCase()]?.id;
            }

            if (lowercaseUserInput.length < 2) {
                await tryAutocompleteInteractionAcknowledge(
                    interaction,
                    localizedAutocompleteFormat(
                        _.uniqBy(
                            Object.values(
                                artistID
                                    ? State.songLinkToEntry
                                    : State.newSongs
                            ).filter(
                                (x) => !artistID || artistID === x.artistID
                            ),
                            (x) => x.name.trim().toLowerCase()
                        ),
                        showHangul
                    )
                );
            } else {
                await tryAutocompleteInteractionAcknowledge(
                    interaction,
                    localizedAutocompleteFormat(
                        _.uniqBy(
                            Object.values(State.songLinkToEntry).filter(
                                (x) =>
                                    (!artistID || artistID === x.artistID) &&
                                    ((showHangul && x.hangulName) || x.name)
                                        .toLowerCase()
                                        .startsWith(lowercaseUserInput)
                            ),
                            (x) => x.name.trim().toLowerCase()
                        ),
                        showHangul
                    )
                );
            }
        } else if (focusedKey === "artist_name") {
            const enteredSongName =
                interactionData.interactionOptions["song_name"];

            let matchingArtists: Array<MatchedArtist> = [];
            if (!enteredSongName) {
                matchingArtists = searchArtists(lowercaseUserInput, []);
            } else {
                // only return artists that have a song that matches the entered one
                const cleanEnteredSongName = cleanSongName(enteredSongName);

                const matchingSongs = Object.values(
                    State.songLinkToEntry
                ).filter(
                    (x) =>
                        x.cleanName.startsWith(cleanEnteredSongName) ||
                        x.hangulCleanName.startsWith(cleanEnteredSongName)
                );

                const matchingSongArtistIDs = matchingSongs.map(
                    (x) => x.artistID
                );

                matchingArtists = _.uniq(
                    Object.values(State.artistToEntry)
                        .filter((x) => matchingSongArtistIDs.includes(x.id))
                        .filter((x) =>
                            (showHangul && x.hangulName ? x.hangulName : x.name)
                                .toLowerCase()
                                .startsWith(lowercaseUserInput)
                        )
                );
            }

            await tryAutocompleteInteractionAcknowledge(
                interaction,
                localizedAutocompleteFormat(matchingArtists, showHangul)
            );
        }
    }
}
