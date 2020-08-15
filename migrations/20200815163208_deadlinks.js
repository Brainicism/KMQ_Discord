
exports.up = function (knex) {
    return knex.schema.createTable("dead_links", function (table) {
        table.string("vlink").notNullable();
        table.string("reason")
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("dead_links");
};
