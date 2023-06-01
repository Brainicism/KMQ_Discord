exports.up = function (knex) {
    return knex.schema.table("player_stats", function (table) {
        table.integer("exp").defaultTo(0);
        table.integer("level").defaultTo(1);
    });
};

exports.down = function (knex) {
    return knex.schema.table("player_stats", function (table) {
        table.dropColumn("exp");
        table.dropColumn("level");
    });
};
