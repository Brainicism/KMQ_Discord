exports.up = function (knex) {
    return knex.schema.createTable("daily_stats", (table) => {
        table.date("date").notNullable();
        table.integer("gameSessions").defaultTo(0);
        table.integer("roundsPlayed").defaultTo(0);
        table.integer("players").defaultTo(0);
        table.integer("newPlayers").defaultTo(0);
        table.integer("serverCount").defaultTo(0);
        table.unique(["date"]);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("daily_stats");
};
