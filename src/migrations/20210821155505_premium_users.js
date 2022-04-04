exports.up = function (knex) {
    return knex.schema.createTable("premium_users", (table) => {
        table.string("user_id").notNullable();
        table.boolean("active").notNullable();
        table.datetime("first_subscribed");
        table.enu("source", ["patreon", "loyalty"]).notNullable();
        table.primary(["user_id"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("premium_users");
};
