exports.up = function (knex) {
    return knex.schema.createTableIfNotExists("temporary_player_stats", function (table) {
        table.string("player_id").notNullable();
        table.datetime("date").notNullable();
        table.integer("songs_guessed").defaultTo(0);
        table.integer("exp_gained").defaultTo(0);
        table.integer("levels_gained").defaultTo(0);
        table.unique(["player_id", "date"]);
    })
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("temporary_player_stats");
};
