exports.up = function (knex) {
    return knex.schema.createTable("game_sessions", function (table) {
        table.increments();
        table.datetime("start_date").notNullable();
        table.string("guild_id").notNullable();
        table.integer("num_participants").notNullable();
        table.float("avg_guess_time").notNullable();
        table.float("session_length").notNullable();
        table.integer("rounds_played").notNullable();
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("game_sessions");
};
