import { DataFiles } from "./constants";
import { IPCLogger } from "./logger";
import { parseJsonFile, pathExists } from "./helpers/utils";

const logger = new IPCLogger("kmq_feature_switch");

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
        if (!this.instance) this.instance = new this();
        logger.info("Reloading feature switches...");
        if (!(await pathExists(DataFiles.FEATURE_SWITCH_CONFIG))) {
            logger.warn("Feature switch file doesn't exist, ignoring...");
            return;
        }

        let featureSwitches: any;
        try {
            featureSwitches = await parseJsonFile(
                DataFiles.FEATURE_SWITCH_CONFIG,
            );
        } catch (e) {
            logger.error(`Error reading feature switch file. err = ${e}`);
            return;
        }

        for (const [featureSwitchName, value] of Object.entries(
            featureSwitches,
        )) {
            if (typeof value !== "boolean") {
                logger.warn(
                    `Attempted to read feature switch ${featureSwitchName}, invalid value ${value}`,
                );
            }

            this.instance.config[featureSwitchName] = value as boolean;
        }
    }

    premiumCommandEnabled(): boolean {
        return this.config["premiumCommandEnabled"] ?? false;
    }

    maintenanceModeEnabled(): boolean {
        return this.config["maintenanceModeEnabled"] ?? false;
    }

    disallowMigrations(): boolean {
        return this.config["disallowMigrations"] ?? false;
    }

    persistMatchedSpotifySongs(): boolean {
        return this.config["persistMatchedSpotifySongs"] ?? false;
    }

    patreonFetchingEnabled(): boolean {
        return this.config["patreonFetchingEnabled"] ?? false;
    }
}
