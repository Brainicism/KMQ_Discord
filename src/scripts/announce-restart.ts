import { spawn, exec } from "child_process";
import { db } from "../databases";

function serverShutdown(restartMinutes: number, restart: boolean) {
    return new Promise((resolve) => {
        const logs = spawn("pm2", ["logs", "kmq", "--out"]);

        logs.stdout.on("data", data => {
            console.log(`${data}`);
        });

        logs.stderr.on("data", data => {
            console.log(`${data}`);
        });

        logs.on('error', (error) => {
            console.log(`${error.message}`);
        });

        setTimeout(() => {
            logs.removeAllListeners();
            logs.kill();
            console.log(restart ? "Restarting now..." : "Stopping now");
            exec(restart ? 'pm2 restart kmq' : 'pm2 stop kmq', (err) => {
                resolve();
            });
        }, restartMinutes * 1000 * 60)
    })
}

(async () => {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error("Missing arguments");
        process.exit(-1);
    }
    const restartMinutes = parseInt(args[0]);
    const restart = args[1] === "true";
    const restartDate = new Date();
    restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);

    await db.kmq("restart_notifications").where("id", "=", "1")
                .update({restart_time: restartDate})

    console.log(`Next restart notification scheduled at ${restartDate}`);
    db.destroy();
    await serverShutdown(restartMinutes, restart);
})();
