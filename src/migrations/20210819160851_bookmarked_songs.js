
exports.up = function(knex) {
    return knex.schema.createTable("bookmarked_songs", (table) => {
        table.string("user_id").notNullable();
        table.string("vlink").notNullable();
        table.unique(["user_id", "vlink"]);
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("bookmarked_songs");
};
