/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table("game_options", (table) => {
        table
            .string("client_id")
            .notNullable()
            .defaultTo(process.env.BOT_CLIENT_ID);
        table.primary(["guild_id", "option_name", "client_id"]);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table("game_options", (table) => {
        table.dropPrimary("client_id");
        table.dropColumn("client_id");
    });
};
