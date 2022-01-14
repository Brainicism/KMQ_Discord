exports.up = function (knex) {
    return knex.schema.createTable("locale", function (table) {
        table.string("guild_id").primary();
        table.string("locale").notNullable();
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("locale");
};
