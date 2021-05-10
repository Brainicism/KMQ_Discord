exports.up = function(knex) {
    return knex.schema.createTable("player_servers", (table) => {
        table.string("player_id").notNullable();
        table.string("server_id").notNullable();
        table.primary(["player_id", "server_id"]);
    })
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("player_servers");
};
