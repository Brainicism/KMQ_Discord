exports.up = function (knex) {
    return knex.schema.renameTable("end_game_messages", "game_messages");
};

exports.down = function (knex) {
    return knex.schema.renameTable("game_messages", "end_game_messages");
};
