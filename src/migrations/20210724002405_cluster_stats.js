
exports.up = function(knex) {
    return knex.schema.createTable("cluster_stats", (table) => {
        table.integer("cluster_id").notNullable();
        table.string("stat_name").notNullable();
        table.integer("stat_value").notNullable();
        table.datetime("last_updated").notNullable();
        table.unique(["cluster_id", "stat_name"]);
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("cluster_stats");
};
