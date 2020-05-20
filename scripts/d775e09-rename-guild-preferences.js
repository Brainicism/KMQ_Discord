`
Breaking change during typescript migration, removed underscores from
previously underscored property keys. 

This script removes the underscores from keys from kmq.guild_preferences.guild_preference

`
const config = require("../config/app_config.json");
const mysql = require("promise-mysql");

(async () => {
    const db = await mysql.createConnection({
        host: "localhost",
        database: "kmq",
        user: config.dbUser,
        password: config.dbPassword
    });
    let results = await db.query("SELECT * FROM guild_preferences");
    for (let result of results) {
        let preference = JSON.parse(result["guild_preference"]);
        console.log("===============================")
        console.log(preference);
        for (key in preference){
            if (key.startsWith("_")){
                delete Object.assign(preference, {[key.substr(1)]: preference[key] })[key];
            }
        }
        let guildPreferencesUpdate = `UPDATE kmq.guild_preferences SET guild_preference = ? WHERE guild_id = ?;`;
        await db.query(guildPreferencesUpdate, [JSON.stringify(preference), preference.guildID]);
        console.log(preference);
    }
    console.log("Done");
})()