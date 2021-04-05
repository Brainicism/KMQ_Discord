/* eslint-disable quote-props */
import log4js from "log4js";
import { config } from "dotenv";
import { resolve } from "path";
import fs from "fs";

config({ path: resolve(__dirname, "../.env") });
export default (name: string): log4js.Logger => {
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
};
