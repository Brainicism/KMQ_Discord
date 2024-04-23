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
        "Automatically restart process when countdown is over",
    )
    .option("--docker-image <docker_image>", "Docker image")
    .option(
        "--timer <minutes>",
        "Countdown duration",
        (x) => parseInt(x, 10),
        5,
    )
    .option(
        "--provisioning-timeout <minutes>",
        "Timeout before standby provisioning is considered failed",
        (x) => parseInt(x, 10),
        15,
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
        },
    );
}

async function announceRestart(
    restartMinutes: number,
    restartDate: Date,
    restart: boolean,
): Promise<void> {
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
            },
        );

        const timer = setInterval(() => {
            if (restartDate.getTime() - Date.now() < 0) {
                clearInterval(timer);
            }

            console.log(
                `Restarting in ${Math.floor(
                    (restartDate.getTime() - Date.now()) / 1000,
                )} seconds`,
            );
        }, 1000 * 10).unref();

        console.log(
            `Next ${
                restart ? "restart" : "shutdown"
            } scheduled at ${restartDate}`,
        );
    } catch (e) {
        console.error(`KMQ might not be up? ${e}`);
        process.exit(1);
    }
}

const delay = (time: number): Promise<void> =>
    // eslint-disable-next-line no-promise-executor-return
    new Promise((res) => setTimeout(res, time));

function serverShutdown(
    restartMinutes: number,
    restart: boolean,
    dockerImage: string,
    provisioningTimeout: number,
): Promise<void> {
    return new Promise(async () => {
        // if stopping server, inform immediately
        const appName = process.env.APP_NAME;
        if (!restart) {
            const restartDate = new Date();
            restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);
            await announceRestart(restartMinutes, restartDate, restart);

            setTimeout(
                () => {
                    console.log("Stopping KMQ...");
                    cp.execSync(`APP_NAME=${appName} npm run docker-stop`);
                },
                restartMinutes * 1000 * 60,
            );
        } else {
            const oldAppName = `${appName}-old`;
            console.log("Upgrading KMQ...");
            console.log("Renaming container...");
            cp.execSync(`docker rename ${appName} ${oldAppName}`);

            console.log(`Pulling new docker image: ${dockerImage}...`);
            cp.execSync(`docker pull ${dockerImage} `);

            console.log("Provisioning standby container with new image...");

            cp.execSync(
                `APP_NAME=${appName} IMAGE_NAME=${dockerImage} IS_STANDBY=true npm run docker-run-internal`,
            );

            let standbyProvisioning = true;
            const standbyCreateTime = Date.now();
            while (standbyProvisioning) {
                const standbyStdout = cp
                    .execSync(
                        `docker exec ${appName} /bin/sh -c "if [ -f "standby" ]; then cat standby; fi"`,
                    )
                    .toString()
                    .trim();

                console.log(
                    `Standby Status: ${standbyStdout || "bootstrapping"}`,
                );

                if (standbyStdout === "ready") {
                    standbyProvisioning = false;
                }

                // abort upgrade
                if (
                    Date.now() - standbyCreateTime >
                    1000 * 60 * provisioningTimeout
                ) {
                    // remove stuck container
                    cp.execSync(`docker rm -f ${appName}`);
                    // rename 'old' container back to normal
                    cp.execSync(`docker rename ${oldAppName} ${appName}`);
                    throw new Error("Standby took too long to provision");
                }

                await delay(1000);
            }

            // announce restart after new standby has provisioned
            const restartDate = new Date();
            restartDate.setMinutes(restartDate.getMinutes() + restartMinutes);
            await announceRestart(restartMinutes, restartDate, restart);

            setTimeout(
                () => {
                    // drop old primary
                    console.log("Dropping old primary...");
                    cp.execSync(`docker rm -f ${oldAppName}`);

                    // promote standby to primary
                    console.log("Promoting standby to primary...");
                    cp.execSync(
                        `docker exec ${appName} /bin/sh -c "mv standby promoted"`,
                    );
                },
                restartMinutes * 1000 * 60,
            );
        }
    });
}

process.on("SIGINT", async () => {
    await abortRestart();
    process.exit(0);
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    const options = program.opts();
    console.log(options);
    const restartMinutes = options.timer;
    const provisioningTimeout = options.provisioningTimeout;
    const dockerImage = options.dockerImage;

    await serverShutdown(
        restartMinutes,
        options.restart,
        dockerImage,
        provisioningTimeout,
    );
})();
