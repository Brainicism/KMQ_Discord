exports.up = function (knex) {
    return knex.schema.alterTable("system_stats", (table) => {
        table.integer("cluster_id").alter();
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("system_stats", (table) => {
        table.integer("cluster_id").notNullable().alter();
    });
};
