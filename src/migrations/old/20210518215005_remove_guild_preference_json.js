const { execSync } = require("child_process");
const path = require("path");

exports.up = function (knex) {
    execSync(
        "npx ts-node",
        [path.join(__dirname, "../scripts/json-presets-to-new-format.ts")],
        { stdio: "inherit" },
    );
    return knex.schema.table("guild_preferences", function (table) {
        table.dropColumn("guild_preference");
    });
};

exports.down = function (knex) {
    return knex.schema.table("guild_preferences", function (table) {
        table.json("guild_preference").notNullable();
    });
};
