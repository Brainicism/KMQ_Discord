exports.up = function (knex) {
    return knex.schema.createTable("game_option_presets", (table) => {
        table.string("guild_id").notNullable();
        table.string("preset_name").notNullable();
        table.string("option_name").notNullable();
        table.json("option_value");
        table.unique(["guild_id", "preset_name", "option_name"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("game_option_presets");
};
