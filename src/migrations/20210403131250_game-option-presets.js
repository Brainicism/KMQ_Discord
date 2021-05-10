
exports.up = function (knex) {
    return knex.schema.createTable("game_option_presets", function (table) {
        table.string("guild_id").notNullable();
        table.string("preset_name").notNullable();
        table.json("game_options").notNullable();
        table.primary(["guild_id", "preset_name"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("game_option_presets");
};
