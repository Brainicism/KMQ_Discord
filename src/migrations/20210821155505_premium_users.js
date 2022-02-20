exports.up = function (knex) {
    return knex.schema.createTable("premium_users", (table) => {
        table.string("user_id");
        table.boolean("active").notNullable();
        table.datetime("first_subscribed");
        table.primary(["user_id"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("premium_users");
};
