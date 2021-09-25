
exports.up = function(knex) {
    return knex.schema
    .renameTable("badges", "badges_players")
    .table("badges_players", (table) => {
        table.integer("badge_id").notNullable().defaultTo(0);
    })
    .createTable("badges", function (table) {
        table.string("id").notNullable();
        table.string("name").notNullable();
        table.integer("priority").notNullable();
        table.primary(["id"]);
    });
};

exports.down = function(knex) {
    return knex.schema
    .dropTable("badges")
    .renameTable("badges_players", "badges")
    .table("badges", function (table) {
        table.dropColumn("badge_id");
    });
};
