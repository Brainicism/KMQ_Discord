exports.up = function (knex) {
    return knex.schema.table("guild_preferences", function (table) {
        table.datetime("join_date");
        table.datetime("last_active");
        table.integer("games_played").defaultTo(0);
        table.integer("songs_guessed").defaultTo(0);
    });
};

exports.down = function (knex) {
    return knex.schema.table("guild_preferences", function (table) {
        table.dropColumn("join_date");
        table.dropColumn("last_active");
        table.dropColumn("games_played");
        table.dropColumn("songs_guessed");
    });
};
