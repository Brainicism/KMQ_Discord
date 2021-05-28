
exports.up = function(knex) {
    return knex.schema.createTable("badges", (table) => {
        table.string("user_id").notNullable();
        table.string("badge_name").notNullable();
        table.unique(["user_id", "badge_name"]);
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("badges");
};
