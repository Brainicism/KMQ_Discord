
exports.up = function (knex) {
    return knex.schema.createTable("not_downloaded", function (table) {
        table.string("vlink").notNullable();
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("not_downloaded");
};
