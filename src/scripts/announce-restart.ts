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
    .option("--docker-image <docker_image>", "Docker image")
    .option(
        "--timer <minutes>",
        "Countdown duration",
        (x) => parseInt(x, 10),
        5
    );
program.parse();

async function abortRestart(): Promise<void> {
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
}

function serverShutdown(
    restartMinutes: number,
    restartDate: Date,
    restart: boolean,
    dockerImage: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        restartMinutes = 0.1;
        setInterval(() => {
            console.log(
                `Restarting in ${Math.floor(
                    (restartDate.getTime() - Date.now()) / 1000
                )} seconds`
            );
        }, 1000 * 10).unref();

        setTimeout(async () => {
            const appName = process.env.APP_NAME;

            let command = "";
            if (!restart) {
                console.log("Stopping KMQ...");
                if (dockerImage) {
                    command = `APP_NAME=${appName} npm run docker-stop`;
                } else {
                    command = "pm2 stop kmq";
                }
            } else {
                console.log("Restarting KMQ...");
                if (dockerImage) {
                    command = `docker rm -f ${appName} && docker pull ${dockerImage} && APP_NAME=${appName} IMAGE_NAME=${dockerImage} npm run docker-run`;
                } else {
                    command = "pm2 restart kmq";
                }
            }

            console.log(command);
            try {
                cp.execSync(command);
                resolve();
            } catch (e) {
                console.error(`Error while issuing restart command :${e}`);
                await abortRestart();
                reject(e);
            }
        }, restartMinutes * 1000 * 60);
    });
}

process.on("SIGINT", async () => {
    await abortRestart();
    process.exit(0);
});

(async () => {
    const options = program.opts();
    const restartMinutes = options.timer;
    const dockerImage = options.dockerImage;
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
        console.error(`KMQ might not be up? ${e}`);
        process.exit(1);
    }

    if (options.softRestart) {
        console.log(
            "Soft restart initiated, see application logs for more details"
        );
    } else {
        console.log(
            `Next ${
                options.restart ? "restart" : "shutdown"
            } scheduled at ${restartDate}`
        );

        await serverShutdown(
            restartMinutes,
            restartDate,
            options.restart,
            dockerImage
        );
    }

    await dbContext.destroy();
})();
