exports.up = function(knex) {
    return knex.schema.createTable("kpop_videos_sql_overrides", (table) => {
        table.increments('id').primary();
        table.string("query").notNullable();
        table.string("reason").notNullable();
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("kpop_videos_sql_overrides");
};
