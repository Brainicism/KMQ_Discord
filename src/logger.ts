/* eslint-disable quote-props */
import log4js from "log4js";
import { config } from "dotenv";
import { resolve } from "path";
import { isMaster } from "cluster";
import fs from "fs";

config({ path: resolve(__dirname, "../.env") });
export function getInternalLogger(name): log4js.Logger {
    const LOG_DIR = resolve(__dirname, "../logs");
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR);
    }

    log4js.configure({
        "appenders": {
            "log": { "type": "dateFile", "filename": `${LOG_DIR}/log.log`, "daysToKeep": 10 },
            "error": { "type": "dateFile", "filename": `${LOG_DIR}/error.log`, "daysToKeep": 10 },
            "error-filtered": { "type": "logLevelFilter", "appender": "error", "level": "error" },
            "info-filtered": { "type": "logLevelFilter", "appender": "log", "level": "info" },
            "console": { "type": "console" },
        },
        "categories": {
            "default": { "appenders": ["error-filtered", "console", "info-filtered"], "level": "info" },
            "debug": { "appenders": ["error"], "level": "debug" },
        },
    });
    return log4js.getLogger(name);
}

/**
 * eris-fleet overrides console.* methods to facilitate IPC to the master process
 */
export class IPCLogger {
    private category: string;
    private logger: log4js.Logger;
    constructor(category: string) {
        this.category = category;
        this.logger = getInternalLogger("kmq");
    }

    getCategorizedMessage(msg: string) {
        return `${this.category} | ${msg}`;
    }
    info(msg: string) {
        if (!isMaster) {
            console.log(this.getCategorizedMessage(msg));
        } else {
            this.logger.info(this.getCategorizedMessage(msg));
        }
    }

    error(msg: string) {
        if (!isMaster) {
            console.error(this.getCategorizedMessage(msg));
        } else {
            this.logger.error(this.getCategorizedMessage(msg));
        }
    }

    debug(msg: string) {
        if (!isMaster) {
            console.debug(this.getCategorizedMessage(msg));
        } else {
            this.logger.debug(this.getCategorizedMessage(msg));
        }
    }

    warn(msg: string) {
        if (!isMaster) {
            console.warn(this.getCategorizedMessage(msg));
        } else {
            this.logger.warn(this.getCategorizedMessage(msg));
        }
    }
}
