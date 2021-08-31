exports.up = function (knex) {
    return knex.schema.createTable("player_stats", function (table) {
        table.string("player_id").notNullable();
        table.integer("songs_guessed").defaultTo(0);
        table.integer("games_played").defaultTo(0);
        table.datetime("first_play");
        table.datetime("last_active");
        table.unique(["player_id"]);
    })
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("player_stats");
};
