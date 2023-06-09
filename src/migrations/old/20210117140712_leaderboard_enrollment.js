exports.up = function (knex) {
    return knex.schema.createTable("leaderboard_enrollment", (table) => {
        table.string("display_name").notNullable();
        table.string("player_id").notNullable();
        table.unique(["player_id"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("leaderboard_enrollment");
};
