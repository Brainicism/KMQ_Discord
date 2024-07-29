import { DataFiles } from "./constants";
import { IPCLogger } from "./logger";
import { parseJsonFileSync, pathExistsSync } from "./helpers/utils";

const logger = new IPCLogger("kmq_feature_switch");

export default class KmqConfiguration {
    private static instance: KmqConfiguration | undefined;
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

    static reload(): void {
        logger.info("Reloading feature switches...");
        if (!this.instance) this.instance = new this();
        if (!pathExistsSync(DataFiles.FEATURE_SWITCH_CONFIG)) {
            logger.warn("Feature switch file doesn't exist, ignoring...");
            return;
        }

        let featureSwitches: any;
        try {
            featureSwitches = parseJsonFileSync(
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

    maintenanceModeEnabled(): boolean {
        return this.config["maintenanceModeEnabled"] ?? false;
    }

    disallowMigrations(): boolean {
        return this.config["disallowMigrations"] ?? false;
    }

    persistMatchedPlaylistSongs(): boolean {
        return this.config["persistMatchedSpotifySongs"] ?? false;
    }

    newsSubscriptionsEnabled(): boolean {
        return this.config["newsSubscriptionEnabled"] ?? false;
    }

    partialChannelFetchingEnabled(): boolean {
        return this.config["partialChannelFetchingEnabled"] ?? false;
    }

    newsGenerationEnabled(): boolean {
        return this.config["newsGenerationEnabled"] ?? false;
    }
}
