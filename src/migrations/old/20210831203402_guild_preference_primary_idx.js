exports.up = function (knex) {
    return knex.schema.table("guild_preferences", function (table) {
        table.dropIndex(["guild_id"], "guild_preferences_id_idx");
        table.string("guild_id", 64).alter();
        table.primary(["guild_id"]);
    });
};

exports.down = function (knex) {
    return knex.schema.table("guild_preferences", async function (table) {
        await table.dropPrimary();
        await table.text("guild_id").alter();
        return knex.raw(
            "ALTER TABLE guild_preferences ADD INDEX guild_preferences_id_idx(guild_id(20));",
        );
    });
};
