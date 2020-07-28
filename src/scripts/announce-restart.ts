import * as mysql from "promise-mysql";
import * as _config from "../../config/app_config.json";
let config: any = _config;

(async () => {
    let args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Missing arguments");
        process.exit(-1);
    }
    let restartMinutes = parseInt(args[0]);
    let restartDate = new Date();
    restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);
    const db = await mysql.createConnection({
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword
    });

    let query = `UPDATE kmq.restart_notifications SET restart_time = ? WHERE id = 1;`;
    await db.query(query, [restartDate]);

    query = `SELECT * FROM kmq.restart_notifications WHERE id = 1;`;
    let restartNotification = (await db.query(query))[0];
    console.log(`Next restart notification scheduled at ${restartNotification["restart_time"]}`);
    db.destroy();
})();
