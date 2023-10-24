exports.up = function (knex) {
    return knex.schema
        .table("badges", function (table) {
            table.integer("id").alter();
        })
        .table("badges_players", function (table) {
            table.dropUnique(
                ["user_id", "badge_name"],
                "badges_user_id_badge_name_unique",
            );
            table
                .integer("badge_id")
                .references("id")
                .inTable("badges")
                .notNull()
                .onDelete("CASCADE")
                .alter();
            table.primary(["user_id", "badge_id"]);
            table.dropColumn("badge_name");
        });
};

exports.down = function (knex) {
    return knex.schema
        .table("badges_players", (table) => {
            table.dropForeign("badge_id", "badges_players_badge_id_foreign");
            table.string("badge_name");
            table.dropPrimary(["user_id", "badge_id"]);
            table.unique(
                ["user_id", "badge_name"],
                "badges_user_id_badge_name_unique",
            );
        })
        .table("badges", function (table) {
            table.string("id").alter();
        });
};
