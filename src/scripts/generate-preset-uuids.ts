import * as uuid from "uuid";
import { IPCLogger } from "../logger.js";
import { getNewConnection } from "../database_context.js";

const logger = new IPCLogger("generate_preset_uuids");

async function generatePresetUUIDs(): Promise<void> {
    const db = getNewConnection();
    const presetsWithUUID = await db.kmq
        .selectFrom("game_option_presets")
        .select(["guild_id", "preset_name"])
        .distinct()
        .where("option_name", "=", "uuid")
        .execute();

    const presetsWithoutUUID = await db.kmq
        .selectFrom("game_option_presets")
        .select(["guild_id", "preset_name"])
        .distinct()
        .where(
            "guild_id",
            "not in",
            presetsWithUUID.map((x) => x.guild_id),
        )
        .where(
            "preset_name",
            "not in",
            presetsWithUUID.map((x) => x.preset_name),
        )
        .execute();

    if (presetsWithoutUUID.length === 0) {
        logger.info(`All ${presetsWithUUID.length} presets have UUIDs.`);
        return;
    }

    logger.info(
        `${presetsWithUUID.length} presets with UUID. Generating presets for ${presetsWithoutUUID.length} presets.`,
    );

    await Promise.allSettled(
        presetsWithoutUUID.map(async (preset) => {
            await db.kmq
                .insertInto("game_option_presets")
                .values({
                    guild_id: preset.guild_id,
                    preset_name: preset.preset_name,
                    option_name: "uuid",
                    option_value: JSON.stringify(`KMQ-${uuid.v4()}`),
                })
                .execute();
        }),
    );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    await generatePresetUUIDs();
})();
