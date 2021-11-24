import { EmbedOptions } from "eris";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { QueriedSong } from "../../types";
import dbContext from "../../database_context";
import { getDebugLogHeader, sendPaginationedEmbed, sendInfoMessage } from "../../helpers/discord_utils";
import { standardDateFormat, chunkArray, friendlyFormattedNumber } from "../../helpers/utils";
import { KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("recentlyadded");

const FIELDS_PER_EMBED = 9;

export default class RecentlyAddedCommand implements BaseCommand {
    help = {
        name: "recentlyadded",
        description: "View songs added to KMQ in the past two weeks.",
        usage: ",recentlyadded",
        examples: [
            {
                example: "`,recentlyadded`",
                explanation: "Show recently added songs",
            },
        ],
        priority: 30,
    };

    aliases = ["recent"];

    call = async ({ message }: CommandArgs): Promise<void> => {
        const newSongs: Array<QueriedSong> = await dbContext.kmq("available_songs")
            .select(["clean_song_name AS songName", "song_name AS originalSongName", "artist_name AS artist", "link AS youtubeLink", "publishedon AS publishDate", "views"])
            .orderBy("publishedon", "DESC")
            .where("publishedon", ">=", standardDateFormat(new Date(Date.now() - 1000 * 60 * 60 * 24 * 14)));

        if (newSongs.length === 0) {
            sendInfoMessage(MessageContext.fromMessage(message), { title: "No Songs Recently Added", description: "Check back later to see if KMQ has added new songs.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            return;
        }

        const fields = newSongs.map((song) => ({
            name: `"${song.originalSongName}" - ${song.artist}`,
            value: `Released ${standardDateFormat(song.publishDate)}\n[${friendlyFormattedNumber(song.views)} views](https://youtu.be/${song.youtubeLink})`,
            inline: true,
        }));

        const embedFieldSubsets = chunkArray(fields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map((embedFieldsSubset) => ({
            title: "Recently Added Songs",
            description: "The following songs were added to KMQ in the past two weeks:",
            fields: embedFieldsSubset,
        }));

        await sendPaginationedEmbed(message, embeds, null);
        logger.info(`${getDebugLogHeader(message)} | Recently added songs retrieved.`);
    };
}
