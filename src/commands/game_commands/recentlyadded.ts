import { EmbedOptions } from "eris";

import { KmqImages } from "../../constants";
import dbContext from "../../database_context";
import {
    getDebugLogHeader,
    getGuildLocale,
    sendInfoMessage,
    sendPaginationedEmbed,
} from "../../helpers/discord_utils";
import {
    getLocalizedArtistName,
    getLocalizedSongName,
} from "../../helpers/game_utils";
import {
    chunkArray,
    friendlyFormattedNumber,
    standardDateFormat,
} from "../../helpers/utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { QueriedSong } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("recentlyadded");

const FIELDS_PER_EMBED = 9;

export default class RecentlyAddedCommand implements BaseCommand {
    aliases = ["recent"];

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.recentlyadded.help.description"
        ),
        examples: [
            {
                example: "`,recentlyadded`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.recentlyadded.help.example"
                ),
            },
        ],
        name: "recentlyadded",
        priority: 30,
        usage: ",recentlyadded",
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
                description: state.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.failure.noSongs.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
                title: state.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.failure.noSongs.title"
                ),
            });
            return;
        }

        const locale = getGuildLocale(message.guildID);
        const fields = newSongs.map((song) => ({
            inline: true,
            name: `"${getLocalizedSongName(
                song,
                locale
            )}" - ${getLocalizedArtistName(song, locale)}`,
            value: `${state.localizer.translate(
                message.guildID,
                "command.recentlyadded.released"
            )} ${standardDateFormat(
                song.publishDate
            )}\n[${friendlyFormattedNumber(
                song.views
            )} ${state.localizer.translate(
                message.guildID,
                "misc.views"
            )}](https://youtu.be/${song.youtubeLink})`,
        }));

        const embedFieldSubsets = chunkArray(fields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                description: state.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.description"
                ),
                fields: embedFieldsSubset,
                title: state.localizer.translate(
                    message.guildID,
                    "command.recentlyadded.title"
                ),
            })
        );

        await sendPaginationedEmbed(message, embeds, null);
        logger.info(
            `${getDebugLogHeader(message)} | Recently added songs retrieved.`
        );
    };
}
