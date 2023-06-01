exports.up = function (knex) {
    return knex.schema.createTable("system_stats", (table) => {
        table.integer("cluster_id").notNullable();
        table.string("stat_name").notNullable();
        table.integer("stat_value").notNullable();
        table.datetime("date").notNullable();
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("system_stats");
};
