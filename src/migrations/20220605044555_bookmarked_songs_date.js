/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table("bookmarked_songs", function (table) {
        table.datetime("bookmarked_at");
        table.dropUnique(["user_id", "vlink"]);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table("bookmarked_songs", function (table) {
        table.dropColumn("bookmarked_at");
        table.unique(["user_id", "vlink"]);
    });
};
