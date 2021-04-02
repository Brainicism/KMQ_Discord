exports.up = function(knex) {
    return knex.schema.createTable("song_guess_count", (table) => {
        table.string("vlink").notNullable().unique();
        table.integer("correct_guesses").notNullable();
        table.integer("rounds_played").notNullable();
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("song_guess_count");
};
