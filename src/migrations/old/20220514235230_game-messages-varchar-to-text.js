/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable("game_messages", function (table) {
        table.increments();
        table.dropUnique(
            ["category", "title", "message"],
            "end_game_messages_category_title_message_unique",
        );
    });

    // for some reason, cant drop unique index and modify varchar length in same promise?
    await knex.schema.alterTable("game_messages", function (table) {
        table.text("message").notNullable().alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table("game_messages", function (table) {
        table.dropColumn("id");
        table.string("message").notNullable().alter();
        table.unique(["category", "title", "message"], {
            indexName: "end_game_messages_category_title_message_unique",
        });
    });
};
