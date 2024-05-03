/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable no-console */
import { config } from "dotenv";
import DailyRotateFile from "winston-daily-rotate-file";
import isMaster from "cluster";
import path, { resolve } from "path";
import winston from "winston";

config({ path: resolve(__dirname, "../.env") });

type LoggerArg = string | number | Object | Array<string | number | Object>;

/**
 * @returns a logger
 */
export function getInternalLogger(): winston.Logger {
    const format = winston.format;
    const consoleFormat = format.printf(({ level, message, timestamp }) => {
        const header = format
            .colorize()
            .colorize(level, `${timestamp} [${level.toUpperCase()}] -`);

        return `${header} ${message}`;
    });

    const logFormat = format.printf(
        ({ level, message, timestamp }) =>
            `${timestamp} [${level.toUpperCase()}] - ${message}`,
    );

    return winston.createLogger({
        level: "debug",
        format: format.combine(format.timestamp(), logFormat),
        transports: [
            new winston.transports.Console({
                format: format.combine(format.timestamp(), consoleFormat),
            }),
            new DailyRotateFile({
                filename: path.join(__dirname, "../logs/kmq-%DATE%.log"),
                maxFiles: "14d",
            }),
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

    getCategorizedMessage(msg: LoggerArg): string {
        if (msg instanceof Array) {
            msg = msg
                .map((x) => (x instanceof Object ? JSON.stringify(x) : x))
                .join(" ");
        } else if (msg instanceof Object) {
            msg = JSON.stringify(msg);
        }

        return `${this.category} | ${msg}`;
    }

    info(msg: LoggerArg): void {
        if (!isMaster) {
            console.log(this.getCategorizedMessage(msg));
        } else {
            this.logger.info(this.getCategorizedMessage(msg));
        }
    }

    error(msg: LoggerArg): void {
        if (!isMaster) {
            console.error(this.getCategorizedMessage(msg));
        } else {
            this.logger.error(this.getCategorizedMessage(msg));
        }
    }

    debug(msg: LoggerArg): void {
        if (!isMaster) {
            console.debug(this.getCategorizedMessage(msg));
        } else {
            this.logger.debug(this.getCategorizedMessage(msg));
        }
    }

    warn(msg: LoggerArg): void {
        if (!isMaster) {
            console.warn(this.getCategorizedMessage(msg));
        } else {
            this.logger.warn(this.getCategorizedMessage(msg));
        }
    }
}
