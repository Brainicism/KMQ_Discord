
exports.up = function(knex) {
    return knex.schema.createTable("publish_date_overrides", (table) => {
        table.string("video_id").notNullable();
        table.date("override_data").notNullable();
        table.unique(["video_id", "override_data"]);
    });
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists("publish_date_overrides");
};
