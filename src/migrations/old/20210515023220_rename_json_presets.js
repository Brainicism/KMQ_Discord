exports.up = function (knex) {
    return knex.schema.renameTable(
        "game_option_presets",
        "game_option_presets_json",
    );
};

exports.down = function (knex) {
    return knex.schema.renameTable(
        "game_option_presets_json",
        "game_option_presets",
    );
};
