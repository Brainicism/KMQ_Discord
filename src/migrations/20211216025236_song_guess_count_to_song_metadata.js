exports.up = function (knex) {
    return knex.schema
        .renameTable("song_guess_count", "song_metadata")
        .table("song_metadata", (table) => {
            table.integer("skip_count").defaultTo(0);
            table.integer("hint_count").defaultTo(0);
            table.integer("time_played_ms").defaultTo(0);
        });
};

exports.down = function (knex) {
    return knex.schema
        .table("song_metadata", (table) => {
            table.dropColumn("skip_count");
            table.dropColumn("hint_count");
            table.dropColumn("time_played_ms");
        })
        .renameTable("song_metadata", "song_guess_count");
};
