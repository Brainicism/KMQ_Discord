
exports.up = function (knex) {
    return knex.schema.createTable("restart_notifications", function (table) {
        table.increments();
        table.datetime("restart_time");
    }).then(() => {
        return knex("restart_notifications").insert({ id: 0, restart_time: null });
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("restart_notifications");
};
