
exports.up = function (knex) {
    return knex.schema.createTable("top_gg_user_votes", function (table) {
        table.string("user_id").notNullable();
        table.datetime("last_voted").notNullable();
        table.integer("total_votes").defaultTo(0);
        table.primary(["user_id"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("top_gg_user_votes");
};
