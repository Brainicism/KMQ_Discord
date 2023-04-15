/* eslint-disable no-await-in-loop */
/* eslint-disable node/no-sync */
/* eslint-disable no-console */
import * as cp from "child_process";
import * as path from "path";
import { config } from "dotenv";
import { program } from "commander";
import Axios from "axios";

config({ path: path.resolve(__dirname, "../../.env") });

program
    .option(
        "--no-restart",
        "Automatically restart process when countdown is over"
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

const delay = (time: number): Promise<void> =>
    // eslint-disable-next-line no-promise-executor-return
    new Promise((res) => setTimeout(res, time));

function serverShutdown(
    restartMinutes: number,
    restartDate: Date,
    restart: boolean,
    dockerImage: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        setInterval(() => {
            console.log(
                `Restarting in ${Math.floor(
                    (restartDate.getTime() - Date.now()) / 1000
                )} seconds`
            );
        }, 1000 * 10).unref();

        setTimeout(async () => {
            const appName = process.env.APP_NAME;
            try {
                if (!restart) {
                    console.log("Stopping KMQ...");
                    cp.execSync(`APP_NAME=${appName} npm run docker-stop`);
                } else {
                    const oldAppName = `${appName}-old`;
                    console.log("Upgrading KMQ...");
                    console.log("Renaming container...");
                    cp.execSync(`docker rename ${appName} ${oldAppName}`);

                    console.log(`Pulling new docker image: ${dockerImage}...`);
                    cp.execSync(`docker pull ${dockerImage} `);

                    console.log(
                        "Provisioning standby container with new image..."
                    );

                    cp.execSync(
                        `APP_NAME=${appName} IMAGE_NAME=${dockerImage} IS_STANDBY=true npm run docker-run`
                    );

                    let standbyProvisioning = true;
                    const standbyCreateTime = Date.now();
                    while (standbyProvisioning) {
                        const standbyStdout = cp
                            .execSync(
                                `docker exec ${appName} /bin/sh -c "if [ -f "standby" ]; then cat standby; fi"`
                            )
                            .toString()
                            .trim();

                        console.log(
                            `Standby Status: ${
                                standbyStdout || "bootstrapping"
                            }`
                        );

                        if (standbyStdout === "ready") {
                            standbyProvisioning = false;
                        }

                        if (Date.now() - standbyCreateTime > 1000 * 60 * 5) {
                            throw new Error(
                                "Standby took too long to provision"
                            );
                        }

                        await delay(1000);
                    }

                    // drop old primary
                    console.log("Dropping old primary...");
                    cp.execSync(`docker rm -f ${oldAppName}`);

                    // promote standby to primary
                    console.log("Promoting standby to primary...");
                    cp.execSync(
                        `docker exec ${appName} /bin/sh -c "rm standby"`
                    );
                }

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
})();
