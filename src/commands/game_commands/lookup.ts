import { getVideoID } from "ytdl-core";
import { LocaleType } from "../../enums/locale_type";
import type BaseCommand from "../interfaces/base_command";
import State from "../../state";
import dbContext from "../../database_context";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import {
    friendlyFormattedDate,
    friendlyFormattedNumber,
} from "../../helpers/utils";
import { IPCLogger } from "../../logger";
import { sendValidationErrorMessage } from "../../helpers/validate";
import {
    getGuildPreference,
    getLocalizedArtistName,
    getLocalizedSongName,
    isPremiumRequest,
} from "../../helpers/game_utils";
import SongSelector from "../../structures/song_selector";
import { KmqImages } from "../../constants";
import type QueriedSong from "../../interfaces/queried_song";
import type HelpDocumentation from "../../interfaces/help";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("lookup");

const getDaisukiLink = (id: string, isMV: boolean): string => {
    if (isMV) {
        return `https://kpop.daisuki.com.br/mv.html?id=${id}`;
    }

    return `https://kpop.daisuki.com.br/audio_videos.html?playid=${id}`;
};

export default class LookupCommand implements BaseCommand {
    aliases = ["songinfo", "songlookup"];
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "lookup",
        description: State.localizer.translate(
            guildID,
            "command.lookup.help.description"
        ),
        usage: ",lookup [youtube_id]",
        examples: [
            {
                example: "`,lookup IHNzOHi8sJs`",
                explanation: State.localizer.translate(
                    guildID,
                    "command.lookup.help.example.song",
                    { song: "Ddu-du Ddu-du", artist: "Blackpink" }
                ),
            },
            {
                example:
                    "`,lookup https://www.youtube.com/watch?v=4TWR90KJl84`",
                explanation: State.localizer.translate(
                    guildID,
                    "command.lookup.help.example.song",
                    { song: "Next Level", artist: "Aespa" }
                ),
            },
        ],
        priority: 40,
    });

    call = async ({ parsedMessage, message }: CommandArgs): Promise<void> => {
        const guildID = message.guildID;
        const messageContext = MessageContext.fromMessage(message);
        let arg = parsedMessage.components[0];
        if (arg.startsWith("<") && arg.endsWith(">")) {
            // Trim <> if user didn't want to show YouTube embed
            arg = arg.slice(1, -1);
        }

        if (arg.startsWith("youtube.com") || arg.startsWith("youtu.be")) {
            // ytdl::getVideoID() requires URLs start with "https://"
            arg = "https://" + arg;
        }

        let videoID: string;
        try {
            videoID = getVideoID(arg);
        } catch {
            await sendValidationErrorMessage(
                message,
                State.localizer.translate(
                    guildID,
                    "command.lookup.validation.invalidYouTubeID"
                ),
                parsedMessage.components[0],
                this.help(guildID).usage
            );

            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Invalid YouTube ID passed. arg = ${arg}.`
            );
            return;
        }

        const kmqSongEntry: QueriedSong = await dbContext
            .kmq("available_songs")
            .select(SongSelector.getQueriedSongFields())
            .where("link", videoID)
            .first();

        const daisukiMVEntry = await dbContext
            .kpopVideos("app_kpop")
            .where("vlink", videoID)
            .first();

        const daisukiAudioEntry = await dbContext
            .kpopVideos("app_kpop_audio")
            .where("vlink", videoID)
            .first();

        const daisukiSongEntry = daisukiMVEntry || daisukiAudioEntry;
        if (!daisukiSongEntry) {
            await sendErrorMessage(messageContext, {
                title: State.localizer.translate(
                    guildID,
                    "command.lookup.notFound.title"
                ),
                description: State.localizer.translate(
                    guildID,
                    "command.lookup.notFound.description"
                ),
                thumbnailUrl: KmqImages.DEAD,
            });

            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Song lookup failed. videoID = ${videoID}.`
            );
            return;
        }

        const daisukiLink = getDaisukiLink(
            daisukiSongEntry.id,
            !!daisukiMVEntry
        );

        const locale = State.getGuildLocale(guildID);
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
            description = State.localizer.translate(
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

            let durationInSeconds = (
                await dbContext
                    .kmq("cached_song_duration")
                    .where("vlink", videoID)
                    .first()
            )?.duration;

            // duration in minutes and seconds
            if (durationInSeconds) {
                const minutes = Math.floor(durationInSeconds / 60);
                const seconds = durationInSeconds % 60;
                songDuration = `${minutes}:${
                    seconds < 10 ? "0" : ""
                }${seconds}`;
            }

            includedInOptions = [
                ...(
                    await SongSelector.getFilteredSongList(
                        await getGuildPreference(guildID),
                        await isPremiumRequest(guildID, message.author.id)
                    )
                ).songs,
            ]
                .map((x) => x.youtubeLink)
                .includes(videoID);

            logger.info(
                `${getDebugLogHeader(
                    message
                )} | KMQ song lookup. videoID = ${videoID}. Included in options = ${includedInOptions}.`
            );
        } else {
            description = State.localizer.translate(
                guildID,
                "command.lookup.notInKMQ",
                { link: daisukiLink }
            );

            const isKorean = locale === LocaleType.KO;
            songName =
                daisukiSongEntry.kname && isKorean
                    ? daisukiSongEntry.kname
                    : daisukiSongEntry.name;

            const artistNameQuery = await dbContext
                .kpopVideos("app_kpop_group")
                .select("name", "kname")
                .where("id", daisukiSongEntry.id_artist)
                .first();

            artistName =
                artistNameQuery.kname && isKorean
                    ? artistNameQuery.kname
                    : artistNameQuery.name;

            songAliases = [...daisukiSongEntry.name_aka.split(";")].join(", ");
            songAliases += songAliases
                ? `, ${daisukiSongEntry.kname}`
                : daisukiSongEntry.kname;

            artistAliases =
                State.aliases.artist[artistNameQuery.name]?.join(", ");

            views = daisukiSongEntry.views;
            publishDate = new Date(daisukiSongEntry.publishedon);

            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Non-KMQ song lookup. videoID = ${videoID}.`
            );
        }

        const viewsString = State.localizer.translate(guildID, "misc.views");

        const fields = [
            {
                name: viewsString[0].toUpperCase() + viewsString.slice(1),
                value: friendlyFormattedNumber(views),
            },
            {
                name: State.localizer.translate(guildID, "misc.releaseDate"),
                value: friendlyFormattedDate(publishDate, guildID),
            },
            {
                name: State.localizer.translate(guildID, "misc.songAliases"),
                value:
                    songAliases ||
                    State.localizer.translate(guildID, "misc.none"),
            },
            {
                name: State.localizer.translate(guildID, "misc.artistAliases"),
                value:
                    artistAliases ||
                    State.localizer.translate(guildID, "misc.none"),
            },
        ];

        if (kmqSongEntry) {
            fields.push(
                {
                    name: State.localizer.translate(guildID, "misc.duration"),
                    value:
                        songDuration ||
                        State.localizer.translate(
                            guildID,
                            "misc.notApplicable"
                        ),
                },
                {
                    name: State.localizer.translate(
                        guildID,
                        "command.lookup.inCurrentGameOptions"
                    ),
                    value: State.localizer.translate(
                        guildID,
                        includedInOptions ? "misc.yes" : "misc.no"
                    ),
                }
            );
        }

        sendInfoMessage(messageContext, {
            title: `${songName} - ${artistName}`,
            url: `https://youtu.be/${videoID}`,
            description,
            thumbnailUrl: `https://img.youtube.com/vi/${videoID}/hqdefault.jpg`,
            fields: fields.map((x) => ({
                name: x.name,
                value: x.value,
                inline: true,
            })),
        });
    };
}
