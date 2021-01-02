/* eslint-disable no-console */
import { execSync } from "child_process";
import dbContext from "../database_context";

function serverShutdown(restartMinutes: number, restartDate: Date, restart: boolean): Promise<void> {
    return new Promise((resolve) => {
        setInterval(() => {
            console.log(`Restarting in ${Math.floor((restartDate.getTime() - Date.now()) / 1000)} seconds`);
        }, 1000 * 10);
        setTimeout(() => {
            console.log(restart ? "Restarting now..." : "Stopping now");
            execSync(restart ? "pm2 restart kmq" : "pm2 stop kmq");
            resolve();
        }, restartMinutes * 1000 * 60);
    });
}

(async () => {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error("Missing arguments");
        process.exit(-1);
    }
    const restartMinutes = parseInt(args[0], 10);
    const restart = args[1] === "true";
    const restartDate = new Date();
    restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);

    await dbContext.kmq("restart_notifications").where("id", "=", "1")
        .update({ restart_time: restartDate });

    console.log(`Next restart scheduled at ${restartDate}`);
    dbContext.destroy();
    await serverShutdown(restartMinutes, restartDate, restart);
})();
