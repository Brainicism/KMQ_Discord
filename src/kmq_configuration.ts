import { IPCLogger } from "./logger";
import { parseJsonFile, pathExists } from "./helpers/utils";
import path from "path";

const logger = new IPCLogger("kmq_feature_switch");
const featureSwitchFile = path.resolve(
    __dirname,
    "../data/feature_switch_config.json"
);

export default class KmqConfiguration {
    private static instance: KmqConfiguration;
    private config: { [featureSwitch: string]: boolean };

    private constructor() {
        this.config = {};
    }

    public static get Instance(): KmqConfiguration {
        if (!this.instance) {
            this.instance = new this();
            KmqConfiguration.reload();
        }

        return this.instance;
    }

    static async reload(): Promise<void> {
        if (!this.instance) return;
        logger.info("Reloading feature switches...");
        if (!(await pathExists(featureSwitchFile))) {
            logger.warn("Feature switch file doesn't exist, ignoring...");
            return;
        }

        let featureSwitches: any;
        try {
            featureSwitches = await parseJsonFile(featureSwitchFile);
        } catch (e) {
            logger.error(`Error reading feature switch file. err = ${e}`);
            return;
        }

        for (const [featureSwitchName, value] of Object.entries(
            featureSwitches
        )) {
            if (typeof value !== "boolean") {
                logger.warn(
                    `Attempted to read feature switch ${featureSwitchName}, invalid value ${value}`
                );
            }

            this.instance.config[featureSwitchName] = value as boolean;
        }
    }

    premiumCommandEnabled(): boolean {
        return this.config["premiumCommandEnabled"] ?? false;
    }

    restartNotificationDisabled(): boolean {
        return this.config["restartNotificationDisabled"] ?? false;
    }

    maintenanceModeEnabled(): boolean {
        return this.config["maintenanceModeEnabled"] ?? false;
    }

    disallowMigrations(): boolean {
        return this.config["disallowMigrations"] ?? false;
    }
}
