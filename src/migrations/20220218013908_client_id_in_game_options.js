/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table("game_options", (table) => {
        table
            .string("client_id")
            .primary()
            .notNullable()
            .defaultTo(process.env.BOT_CLIENT_ID);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table("game_options", (table) => {
        table.dropColumn("client_id");
    });
};
