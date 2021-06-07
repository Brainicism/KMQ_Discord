
exports.up = function(knex) {
    return knex.schema.createTable("cached_song_duration", (table) => {
        table.string("vlink").notNullable();
        table.smallint("duration").notNullable();
        table.unique(["vlink"]);
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("cached_song_duration");
};
