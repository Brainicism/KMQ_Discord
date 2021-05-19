import { DatabaseContext, getNewConnection } from "../database_context";

async function exportJsonPresetsToNewTable(db: DatabaseContext): Promise<void> {
    const jsonPresets = await db.kmq("game_option_presets_json").select("*");
    await Promise.all(jsonPresets.map(async (preset) => {
        const guildID = preset["guild_id"];
        const presetName = preset["preset_name"];
        const options = JSON.parse(preset["game_options"]);
        await Promise.all(
            Object.entries(options).map(async (option) => {
                await db.kmq("game_option_presets")
                    .insert({
                        guild_id: guildID,
                        preset_name: presetName,
                        option_name: option[0],
                        option_value: JSON.stringify(option[1]),
                    });
            }),
        );
    }));
}

(async () => {
    const db = getNewConnection();
    try {
        await exportJsonPresetsToNewTable(db);
    } finally {
        await db.destroy();
    }
})();
