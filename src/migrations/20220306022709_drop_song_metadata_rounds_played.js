/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table("song_metadata", function (table) {
        table.dropColumn("rounds_played");
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table("song_metadata", function (table) {
        table.integer("rounds_played").defaultTo(0);
    });
};
