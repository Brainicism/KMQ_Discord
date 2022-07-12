/* eslint-disable node/no-sync */
/* eslint-disable no-console */
import * as cp from "child_process";
import * as path from "path";
import { config } from "dotenv";
import { program } from "commander";
import Axios from "axios";
import dbContext from "../database_context";

config({ path: path.resolve(__dirname, "../../.env") });

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
    restart: boolean
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
            } else {
                console.log("Restarting KMQ...");
                command = "pm2 restart kmq";
            }

            cp.execSync(command);
            resolve();
        }, restartMinutes * 1000 * 60);
    });
}

process.on("SIGINT", async () => {
    console.log("Aborting restart");
    await Axios.post(
        `http://127.0.0.1:${process.env.WEB_SERVER_PORT}/clear-restart`,
        {},
        {
            headers: {
                "Content-Type": "application/json",
            },
        }
    );
    process.exit(0);
});

(async () => {
    const options = program.opts();
    const restartMinutes = options.timer;
    const restartDate = new Date();
    restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);

    console.log(options);

    try {
        await Axios.post(
            `http://127.0.0.1:${process.env.WEB_SERVER_PORT}/announce-restart`,
            {
                soft: options.softRestart,
                restartMinutes,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (e) {
        console.log(e);
    }

    if (!options.softRestart) {
        console.log(
            `Next ${
                options.restart ? "restart" : "shutdown"
            } scheduled at ${restartDate}`
        );

        await serverShutdown(restartMinutes, restartDate, options.restart);
    } else {
        console.log(
            "Soft restart initiated, see application logs for more details"
        );
    }

    await dbContext.destroy();
})();
