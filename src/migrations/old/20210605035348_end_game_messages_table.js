exports.up = function (knex) {
    return knex.schema.createTable("end_game_messages", (table) => {
        table.string("category").notNullable();
        table.string("title").notNullable();
        table.string("message").notNullable();
        table.integer("weight").defaultTo(1);
        table.unique(["category", "title", "message"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("end_game_messages");
};
