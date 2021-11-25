exports.up = function (knex) {
    return knex.schema.createTable("competition_moderators", function (table) {
        table.string("guild_id").notNullable();
        table.string("user_id").notNullable();
        table.primary(["guild_id", "user_id"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable("competition_moderators");
};
