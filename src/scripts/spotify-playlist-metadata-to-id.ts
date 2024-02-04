import dbContext from "../database_context";
import type { PlaylistMetadata } from "../interfaces/playlist_metadata";

(async () => {
    if (require.main === module) {
        {
            const metadataList = await dbContext.kmq
                .selectFrom("game_options")
                .selectAll()
                .where("option_name", "=", "spotifyPlaylistMetadata")
                .where("option_value", "<>", "null")
                .execute();

            const playlistIDs: Array<{
                guild_id: string;
                option_name: string;
                option_value: string;
                client_id: string;
            }> = [];

            for (const metadata of metadataList) {
                if (metadata.option_value) {
                    const optionValue: PlaylistMetadata = JSON.parse(
                        metadata.option_value,
                    );

                    const playlistID = optionValue.playlistId;
                    playlistIDs.push({
                        guild_id: metadata.guild_id,
                        option_name: "spotifyPlaylistID",
                        option_value: JSON.stringify(playlistID),
                        client_id: metadata.client_id,
                    });
                }
            }

            await dbContext.kmq
                .insertInto("game_options")
                .values(playlistIDs)
                .execute();

            await dbContext.kmq
                .deleteFrom("game_options")
                .where("option_name", "=", "spotifyPlaylistMetadata")
                .execute();
        }

        {
            const metadataList = await dbContext.kmq
                .selectFrom("game_option_presets")
                .selectAll()
                .where("option_name", "=", "spotifyPlaylistMetadata")
                .where("option_value", "<>", "null")
                .execute();

            const playlistIDs: Array<{
                guild_id: string;
                preset_name: string;
                option_name: string;
                option_value: string;
            }> = [];

            for (const metadata of metadataList) {
                if (metadata.option_value) {
                    const optionValue: PlaylistMetadata = JSON.parse(
                        metadata.option_value,
                    );

                    const playlistID = optionValue.playlistId;
                    playlistIDs.push({
                        guild_id: metadata.guild_id,
                        preset_name: metadata.preset_name,
                        option_name: "spotifyPlaylistID",
                        option_value: JSON.stringify(playlistID),
                    });
                }
            }

            await dbContext.kmq
                .insertInto("game_option_presets")
                .values(playlistIDs)
                .execute();

            await dbContext.kmq
                .deleteFrom("game_option_presets")
                .where("option_name", "=", "spotifyPlaylistMetadata")
                .execute();
        }

        process.exit(0);
    }
})();
