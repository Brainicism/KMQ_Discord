exports.up = function (knex) {
    return knex.raw(
        "ALTER TABLE guild_preferences ADD INDEX guild_preferences_id_idx(guild_id(20));",
    );
};

exports.down = function (knex) {
    return knex.schema.table("guild_preferences", function (table) {
        table.dropIndex(["guild_id"], "guild_preferences_id_idx");
    });
};
