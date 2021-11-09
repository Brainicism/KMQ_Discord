
exports.up = async function(knex) {
    await knex.raw("DELETE FROM dead_links");
    return knex.schema.alterTable("dead_links", (table) => {
        table.primary(["vlink"]);
    })
};

exports.down = function(knex) {
    return knex.schema.alterTable("dead_links", (table) => {
        table.dropPrimary(["vlink"]);
    })
};
