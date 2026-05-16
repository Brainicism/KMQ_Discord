import {
    DATABASE_DOWNLOAD_DIR,
    KMQ_USER_AGENT,
    LATEST_DAISUKI_DUMP,
} from "../../constants";
import { IPCLogger } from "../../logger";
import Axios from "axios";
import fs from "fs";
import { exec as execCb } from "child_process";
import util from "util";

const exec = util.promisify(execCb);
const logger = new IPCLogger("seed_phase_pull");

/**
 * Phase 1: Pull — Download and extract the Daisuki SQL dump.
 */
export async function pull(): Promise<void> {
    logger.info("Phase 1: Downloading Daisuki database archive...");
    const daisukiDbDownloadUrl =
        "https://soridata.com/download.php?pass=$PASSWORD";
    const daisukiDownloadResp = await Axios.get(
        daisukiDbDownloadUrl.replace(
            "$PASSWORD",
            process.env.DAISUKI_DB_PASSWORD as string,
        ),
        {
            responseType: "arraybuffer",
            headers: {
                "User-Agent": KMQ_USER_AGENT,
            },
        },
    );

    await fs.promises.writeFile(LATEST_DAISUKI_DUMP, daisukiDownloadResp.data, {
        encoding: null,
    });
    logger.info("Downloaded Daisuki database archive");

    logger.info("Extracting Daisuki database...");
    await fs.promises.mkdir(`${DATABASE_DOWNLOAD_DIR}/`, { recursive: true });
    await exec(`unzip -oq ${LATEST_DAISUKI_DUMP} -d ${DATABASE_DOWNLOAD_DIR}/`);
    logger.info("Extracted Daisuki database");
}
