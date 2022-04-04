import * as uuid from "uuid";

import { getNewConnection } from "../database_context";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("generate_preset_uuids");

async function generatePresetUUIDs(): Promise<void> {
    const db = getNewConnection();
    const presetsWithUUID = db
        .kmq("game_option_presets")
        .distinct("guild_id", "preset_name")
        .where("option_name", "=", "uuid");

    const presetsWithoutUUID = await db
        .kmq("game_option_presets")
        .select(["guild_id", "preset_name"])
        .distinct("guild_id", "preset_name")
        .whereNotIn(["guild_id", "preset_name"], presetsWithUUID);

    if (presetsWithoutUUID.length === 0) {
        logger.info(
            `All ${(await presetsWithUUID).length} presets have UUIDs.`
        );
        return;
    }

    logger.info(
        `${
            (await presetsWithUUID).length
        } presets with UUID. Generating presets for ${
            presetsWithoutUUID.length
        } presets.`
    );
    for (const preset of presetsWithoutUUID) {
        await db.kmq("game_option_presets").insert({
            guild_id: preset.guild_id,
            option_name: "uuid",
            option_value: JSON.stringify(`KMQ-${uuid.v4()}`),
            preset_name: preset.preset_name,
        });
    }
}

(async () => {
    await generatePresetUUIDs();
})();
