exports.up = function (knex) {
    return knex.schema.createTable("guild_preferences", function (table) {
        table.string("guild_id").notNullable();
        table.json("guild_preference").notNullable();
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("guild_preferences");
};
