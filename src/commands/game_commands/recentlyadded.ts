import { EmbedOptions } from "eris";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { QueriedSong } from "../../types";
import dbContext from "../../database_context";
import {
    getDebugLogHeader,
    sendPaginationedEmbed,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import {
    standardDateFormat,
    chunkArray,
    friendlyFormattedNumber,
} from "../../helpers/utils";
import { KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("recentlyadded");

const FIELDS_PER_EMBED = 9;

export default class RecentlyAddedCommand implements BaseCommand {
    help = (guildID: string) => ({
            name: "recentlyadded",
            description: state.localizer.translate(guildID,
                "recentlyadded.help.description",
            ),
            usage: ",recentlyadded",
            examples: [
                {
                    example: "`,recentlyadded`",
                    explanation: state.localizer.translate(guildID, "recentlyadded.help.example"),
                },
            ],
        });

    helpPriority = 30;

    aliases = ["recent"];

    call = async ({ message }: CommandArgs): Promise<void> => {
        const newSongs: Array<QueriedSong> = await dbContext
            .kmq("available_songs")
            .select([
                "clean_song_name AS songName",
                "song_name AS originalSongName",
                "artist_name AS artist",
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
                title: state.localizer.translate(message.guildID, "recentlyadded.failure.noSongs.title"),
                description: state.localizer.translate(message.guildID,
                    "recentlyadded.failure.noSongs.description",
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            });
            return;
        }

        const fields = newSongs.map((song) => ({
            name: `"${song.originalSongName}" - ${song.artist}`,
            value: `${state.localizer.translate(message.guildID, "recentlyadded.released")} ${standardDateFormat(
                song.publishDate
            )}\n[${friendlyFormattedNumber(song.views)} ${state.localizer.translate(message.guildID,
                "recentlyadded.views"
            )}](https://youtu.be/${song.youtubeLink})`,
            inline: true,
        }));

        const embedFieldSubsets = chunkArray(fields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                title: state.localizer.translate(message.guildID, "recentlyadded.title"),
                description: state.localizer.translate(message.guildID,
                    "recentlyadded.description",
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
