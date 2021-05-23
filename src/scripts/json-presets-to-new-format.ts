import { DatabaseContext, getNewConnection } from "../database_context";
import _logger from "../logger";

const logger = _logger("json-presets-to-new-format");

async function exportJsonPresetsToNewTable(db: DatabaseContext): Promise<void> {
    const jsonPresets = await db.kmq("game_option_presets_json").select("*");
    await Promise.all(jsonPresets.map(async (preset) => {
        const guildID = preset["guild_id"];
        const presetName = preset["preset_name"];
        const options = JSON.parse(preset["game_options"]);
        try {
            const presetOptions = Object.entries(options).map((option) => ({
                guild_id: guildID,
                preset_name: presetName,
                option_name: option[0],
                option_value: JSON.stringify(option[1]),
            }));
            await db.kmq.transaction(async (trx) => {
                await db.kmq("game_option_presets")
                    .insert(presetOptions)
                    .transacting(trx);
            });
        } catch (err) {
            logger.error(`Migration of preset ${presetName} of ${guildID} failed, err = ${err}`);
        }
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
