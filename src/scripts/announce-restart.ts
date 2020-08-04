import * as mysql from "promise-mysql";
import * as _config from "../../config/app_config.json";
const config: any = _config;

(async () => {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Missing arguments");
        process.exit(-1);
    }
    const restartMinutes = parseInt(args[0]);
    const restartDate = new Date();
    restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);
    const db = await mysql.createConnection({
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword
    });

    let query = `UPDATE kmq.restart_notifications SET restart_time = ? WHERE id = 1;`;
    await db.query(query, [restartDate]);

    query = `SELECT * FROM kmq.restart_notifications WHERE id = 1;`;
    const restartNotification = (await db.query(query))[0];
    console.log(`Next restart notification scheduled at ${restartNotification["restart_time"]}`);
    db.destroy();
})();
