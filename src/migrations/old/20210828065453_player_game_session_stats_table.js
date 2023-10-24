exports.up = function (knex) {
    return knex.schema.createTable(
        "player_game_session_stats",
        function (table) {
            table.string("player_id").notNullable();
            table.datetime("date").notNullable();
            table.integer("songs_guessed").defaultTo(0);
            table.integer("exp_gained").defaultTo(0);
            table.integer("levels_gained").defaultTo(0);
            table.unique(["player_id", "date"]);
        },
    );
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("player_game_session_stats");
};
