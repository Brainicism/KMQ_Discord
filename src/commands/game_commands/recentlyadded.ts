import { EmbedOptions } from "eris";
import BaseCommand from "../interfaces/base_command";
import dbContext from "../../database_context";
import {
    getDebugLogHeader,
    sendPaginationedEmbed,
    sendInfoMessage,
    getGuildLocale,
} from "../../helpers/discord_utils";
import {
    standardDateFormat,
    chunkArray,
    friendlyFormattedNumber,
} from "../../helpers/utils";
import {
    getLocalizedSongName,
    getLocalizedArtistName,
} from "../../helpers/game_utils";
import { KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import QueriedSong from "../../interfaces/queried_song";
import CommandArgs from "../../interfaces/command_args";
import HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("recentlyadded");

const FIELDS_PER_EMBED = 9;

export default class RecentlyAddedCommand implements BaseCommand {
    aliases = ["recent"];

    help = (guildID: string): HelpDocumentation => ({
        name: "recentlyadded",
        description: State.localizer.translate(
            guildID,
            "command.recentlyadded.help.description"
        ),
        usage: ",recentlyadded",
        examples: [
            {
                example: "`,recentlyadded`",
                explanation: State.localizer.translate(
                    guildID,
                    "command.recentlyadded.help.example"
                ),
            },
        ],
        priority: 30,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const newSongs: Array<QueriedSong> = await dbContext
            .kmq("available_songs")
            .select([
                "song_name_en AS originalSongName",
                "song_name_ko AS originalHangulSongName",
                "artist_name_en AS artistName",
                "artist_name_ko AS hangulArtistName",
                "link AS youtubeLink",
                "publishedon AS publishDate",
                "views",
            ])
            .orderBy("publishedon", "DESC")
            .where(
                "publishedon",
                ">=",
                standardDateFormat(
                    new Date(Date.now() - 1000 * 60 * 60 * 24 * 14)
                )
            );

        if (newSongs.length === 0) {
            sendInfoMessage(MessageContext.fromMessage(message), {
                title: State.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.failure.noSongs.title"
                ),
                description: State.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.failure.noSongs.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            });
            return;
        }

        const locale = getGuildLocale(message.guildID);
        const fields = newSongs.map((song) => ({
            name: `"${getLocalizedSongName(
                song,
                locale
            )}" - ${getLocalizedArtistName(song, locale)}`,
            value: `${State.localizer.translate(
                message.guildID,
                "command.recentlyadded.released"
            )} ${standardDateFormat(
                song.publishDate
            )}\n[${friendlyFormattedNumber(
                song.views
            )} ${State.localizer.translate(
                message.guildID,
                "misc.views"
            )}](https://youtu.be/${song.youtubeLink})`,
            inline: true,
        }));

        const embedFieldSubsets = chunkArray(fields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                title: State.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.title"
                ),
                description: State.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.description"
                ),
                fields: embedFieldsSubset,
            })
        );

        await sendPaginationedEmbed(message, embeds, null);
        logger.info(
            `${getDebugLogHeader(message)} | Recently added songs retrieved.`
        );
    };
}
