
exports.up = function (knex) {
    return knex.schema.table('guild_preferences', function (table) {
        table.datetime('join_date');
        table.datetime('last_active');
    });
};

exports.down = function (knex) {
    return knex.schema.table('guild_preferences', function (table) {
        table.dropColumn('join_date');
        table.dropColumn('last_active');
    });
};
