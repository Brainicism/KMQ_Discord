exports.up = function(knex) {
    return knex.schema.table("game_sessions", (table) => {
        table.integer("correct_guesses").notNullable();
    });
};

exports.down = function(knex) {
    return knex.schema.table("game_sessions", (table) => {
        table.dropColumn("correct_guesses");
    });
};
