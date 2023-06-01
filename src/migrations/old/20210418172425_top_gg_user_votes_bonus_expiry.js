exports.up = function (knex) {
    return knex.schema.alterTable("top_gg_user_votes", (table) => {
        table.renameColumn("last_voted", "buff_expiry_date");
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("top_gg_user_votes", (table) => {
        table.renameColumn("buff_expiry_date", "last_voted");
    });
};
