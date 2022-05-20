/* eslint-disable no-console */
import { execSync } from "child_process";
import { program } from "commander";
import dbContext from "../database_context";

program
    .option(
        "--soft-restart",
        "Initiate soft-restart for minimal downtime",
        false
    )
    .option(
        "--no-restart",
        "Automatically restart pm2 process when countdown is over"
    )
    .option(
        "--timer <minutes>",
        "Countdown duration",
        (x) => parseInt(x, 10),
        5
    );
program.parse();

function serverShutdown(
    restartMinutes: number,
    restartDate: Date,
    restart: boolean,
    softRestart: boolean
): Promise<void> {
    return new Promise((resolve) => {
        setInterval(() => {
            console.log(
                `Restarting in ${Math.floor(
                    (restartDate.getTime() - Date.now()) / 1000
                )} seconds`
            );
        }, 1000 * 10).unref();

        setTimeout(() => {
            let command = "";
            if (!restart) {
                console.log("Stopping KMQ...");
                command = "pm2 stop kmq";
            } else if (softRestart) {
                console.log("Soft restarting KMQ...");
                command = "tsc && curl -X POST localhost:5858/soft-restart";
            } else {
                console.log("Restarting KMQ...");
                command = "pm2 restart kmq";
            }

            execSync(command);
            resolve();
        }, restartMinutes * 1000 * 60);
    });
}

process.on("SIGINT", async () => {
    console.log("Aborting restart");
    await dbContext
        .kmq("restart_notifications")
        .where("id", "=", "1")
        .update({ restart_time: null });
    await dbContext.destroy();
    process.exit(0);
});

(async () => {
    const options = program.opts();
    const restartMinutes = options.timer;
    const restartDate = new Date();
    restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);

    console.log(options);

    await dbContext
        .kmq("restart_notifications")
        .where("id", "=", "1")
        .update({ restart_time: restartDate });

    console.log(
        `Next ${
            options.restart ? "restart" : "shutdown"
        } scheduled at ${restartDate}`
    );

    await serverShutdown(
        restartMinutes,
        restartDate,
        options.restart,
        options.softRestart
    );
    await dbContext.destroy();
})();
