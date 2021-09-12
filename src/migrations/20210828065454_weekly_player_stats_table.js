exports.up = function (knex) {
    return knex.schema.createTableIfNotExists("weekly_player_stats", function (table) {
        table.string("player_id").notNullable();
        table.integer("songs_guessed").defaultTo(0);
        table.integer("games_played").defaultTo(0);
        table.integer("exp").defaultTo(0);
        table.integer("level").defaultTo(0);
        table.unique(["player_id"]);
    })
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("weekly_player_stats");
};
