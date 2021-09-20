/* eslint-disable quote-props */
import { config } from "dotenv";
import { resolve } from "path";
import { isMaster } from "cluster";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

config({ path: resolve(__dirname, "../.env") });
export function getInternalLogger(): winston.Logger {
    const format = winston.format;
    const consoleFormat = format.printf(({ level, message, timestamp }) => {
        const header = format.colorize().colorize(level, `${timestamp} [${level.toUpperCase()}] -`);
        return `${header} ${message}`;
    });

    const logFormat = format.printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}] - ${message}`);
    return winston.createLogger({
        level: process.env.DEBUG_LOGGING ? "debug" : "info",
        format: format.combine(
            format.timestamp(),
            logFormat,
        ),
        transports: [
            new winston.transports.Console({
                format: format.combine(
                    format.timestamp(),
                    consoleFormat,
                ),
            }),
            new (DailyRotateFile)({ filename: "../logs/error.log", level: "error", maxFiles: "14d" }),
            new (DailyRotateFile)({ filename: "../logs/combined.log", maxFiles: "14d" }),
        ],
    });
}

/**
 * eris-fleet overrides console.* methods to facilitate IPC to the master process
 */
export class IPCLogger {
    private category: string;
    private logger: winston.Logger;
    constructor(category: string) {
        this.category = category;
        this.logger = getInternalLogger();
    }

    getCategorizedMessage(msg: string) {
        return `${this.category} | ${msg}`;
    }
    info(msg: string | number) {
        if (!isMaster) {
            console.log(this.getCategorizedMessage(msg as string));
        } else {
            this.logger.info(this.getCategorizedMessage(msg as string));
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
