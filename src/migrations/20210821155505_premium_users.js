
exports.up = function(knex) {
    return knex.schema.createTable("premium_users", (table) => {
        table.string("user_id");
        table.boolean("active").notNullable();
        table.datetime("pledge_relationship_start");
        table.datetime("last_charge_date");
        table.primary(["user_id"]);
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("premium_users");
};
