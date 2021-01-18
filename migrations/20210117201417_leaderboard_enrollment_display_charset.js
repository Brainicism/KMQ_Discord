exports.up = function(knex) {
    return knex.schema.alterTable("leaderboard_enrollment", (table) => {
        table.string("display_name")
        .collate('utf8_general_ci')
        .notNullable()
        .alter();
    })
};

exports.down = function(knex) {
};
