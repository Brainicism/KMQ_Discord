
exports.up = function(knex) {
    return knex.schema.table("guild_preferences", function (table) {
        table.dropColumn("guild_preference");
    });
};

exports.down = function(knex) {
    return knex.schema.table("guild_preferences", function (table) {
        table.json("guild_preference").notNullable();
    });
};
