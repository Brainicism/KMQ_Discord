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
        table.dropUnique(["guild_id", "option_name"]);
        table.unique(["guild_id", "option_name", "client_id"]);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table("game_options", (table) => {
        table.dropUnique(["guild_id", "option_name", "client_id"]);
        table.unique(["guild_id", "option_name"]);
        table.dropColumn("client_id");
    });
};
