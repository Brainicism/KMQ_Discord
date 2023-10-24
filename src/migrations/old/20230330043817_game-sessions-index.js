/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.raw(
        "ALTER TABLE game_sessions ADD INDEX game_sessions_start_date_index(start_date);",
    );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table("game_sessions", function (table) {
        table.dropIndex(["start_date"], "game_sessions_start_date_index");
    });
};
