import * as uuid from "uuid";
import { getNewConnection } from "../database_context";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("generate_preset_uuids");

async function generatePresetUUIDs() {
    const db = getNewConnection();
    const presetsWithUUID = await db.kmq("game_option_presets")
        .select(["guild_id", "preset_name"])
        .distinct("guild_id", "preset_name")
        .where("option_name", "=", "uuid");

    const presetsWithoutUUID = await db.kmq("game_option_presets")
        .select(["guild_id", "preset_name"])
        .distinct("guild_id", "preset_name")
        .whereNotIn(["guild_id", "preset_name"], presetsWithUUID.map((pair) => [pair["guild_id"], pair["preset_name"]]));

    logger.info(`${presetsWithUUID.length} presets with UUID. Generating presets for ${presetsWithoutUUID.length} presets.`);
    for (const preset of presetsWithoutUUID) {
        await db.kmq("game_option_presets")
            .insert({
                guild_id: preset.guild_id,
                preset_name: preset.preset_name,
                option_name: "uuid",
                option_value: uuid.v4(),
            });
    }
}

(async () => {
    await generatePresetUUIDs();
})();
