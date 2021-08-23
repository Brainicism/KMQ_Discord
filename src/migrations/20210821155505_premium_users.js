
exports.up = function(knex) {
    return knex.schema.createTable("premium_users", (table) => {
        table.string("user_id").notNullable();
        table.datetime("premium_expiry_date").notNullable();
        table.integer("months_supported").notNullable();
        table.unique(["user_id"]);
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("premium_users");
};
