import { LocaleType } from "../../helpers/localization_manager";
import BaseCommand, { Help, CommandArgs } from "../interfaces/base_command";
import { state } from "../../kmq_worker";
import dbContext from "../../database_context";
import {
    getDebugLogHeader,
    getGuildLocale,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import {
    friendlyFormattedDate,
    friendlyFormattedNumber,
    extractYouTubeID,
    validYouTubeIDFormat,
} from "../../helpers/utils";
import { IPCLogger } from "../../logger";
import { sendValidationErrorMessage } from "../../helpers/validate";
import { QueriedSong } from "../../types";
import {
    getGuildPreference,
    getLocalizedArtistName,
    getLocalizedSongName,
} from "../../helpers/game_utils";
import SongSelector from "../../structures/song_selector";
import { KmqImages } from "../../constants";

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

    help = (guildID: string): Help => ({
        name: "lookup",
        description: state.localizer.translate(
            guildID,
            "command.lookup.help.description"
        ),
        usage: ",lookup [youtube_id]",
        examples: [
            {
                example: "`,lookup IHNzOHi8sJs`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.lookup.help.example.song",
                    { song: "Ddu-du Ddu-du", artist: "Blackpink" }
                ),
            },
            {
                example:
                    "`,lookup https://www.youtube.com/watch?v=4TWR90KJl84`",
                explanation: state.localizer.translate(
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

        const videoID = extractYouTubeID(arg);

        if (!validYouTubeIDFormat(videoID)) {
            await sendValidationErrorMessage(
                message,
                state.localizer.translate(
                    guildID,
                    "command.lookup.validation.invalidYouTubeID"
                ),
                parsedMessage.components[0],
                this.help(guildID).usage
            );

            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Invalid YouTube ID passed. videoID = ${videoID}.`
            );
            return;
        }

        const availableSongEntry: QueriedSong = await dbContext
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
                title: state.localizer.translate(
                    guildID,
                    "command.lookup.notFound.title"
                ),
                description: state.localizer.translate(
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

        const locale = getGuildLocale(guildID);
        let description: string;
        let songName: string;
        let artistName: string;
        let songAliases: string;
        let artistAliases: string;
        let views: number;
        let publishDate: Date;
        let includedInOptions = false;

        if (availableSongEntry) {
            description = state.localizer.translate(
                guildID,
                "command.lookup.inKMQ",
                { link: daisukiLink }
            );
            songName = getLocalizedSongName(availableSongEntry, locale);
            artistName = getLocalizedArtistName(availableSongEntry, locale);
            songAliases = state.aliases.song[videoID]?.join(", ");
            artistAliases =
                state.aliases.artist[availableSongEntry.artistName]?.join(", ");
            views = availableSongEntry.views;
            publishDate = availableSongEntry.publishDate;

            if (state.gameSessions[guildID]) {
                const gameSession = state.gameSessions[guildID];
                includedInOptions = gameSession.isSongInOptions(videoID);
                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | KMQ song lookup during a game. videoID = ${videoID}. Included in options = ${includedInOptions}.`
                );
            } else {
                includedInOptions = [
                    ...(
                        await SongSelector.getFilteredSongList(
                            await getGuildPreference(guildID)
                        )
                    ).songs,
                ]
                    .map((x) => x.youtubeLink)
                    .includes(videoID);

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | KMQ song lookup outside a game. videoID = ${videoID}. Included in options = ${includedInOptions}.`
                );
            }
        } else {
            description = state.localizer.translate(
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
                state.aliases.artist[artistNameQuery.name]?.join(", ");

            views = daisukiSongEntry.views;
            publishDate = new Date(daisukiSongEntry.publishedon);

            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Non-KMQ song lookup. videoID = ${videoID}.`
            );
        }

        const viewsString = state.localizer.translate(guildID, "misc.views");

        sendInfoMessage(messageContext, {
            title: `${songName} - ${artistName}`,
            url: `https://youtu.be/${videoID}`,
            description,
            thumbnailUrl: `https://img.youtube.com/vi/${videoID}/hqdefault.jpg`,
            fields: [
                {
                    name: viewsString[0].toUpperCase() + viewsString.slice(1),
                    value: friendlyFormattedNumber(views),
                },
                {
                    name: state.localizer.translate(
                        guildID,
                        "misc.releaseDate"
                    ),
                    value: friendlyFormattedDate(publishDate, guildID),
                },
                {
                    name: state.localizer.translate(
                        guildID,
                        "misc.songAliases"
                    ),
                    value: songAliases || "None",
                },
                {
                    name: state.localizer.translate(
                        guildID,
                        "misc.artistAliases"
                    ),
                    value: artistAliases || "None",
                },
                {
                    name: state.localizer.translate(
                        guildID,
                        "command.lookup.inCurrentGameOptions"
                    ),
                    value: includedInOptions ? "Yes" : "No",
                },
            ],
        });
    };
}
