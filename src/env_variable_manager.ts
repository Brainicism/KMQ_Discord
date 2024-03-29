export default class EnvVariableManager {
    static isGodMode(): boolean {
        return process.env.GOD_MODE === "true";
    }

    static isMinimalRun(): boolean {
        return process.env.MINIMAL_RUN === "true";
    }

    static isStandby(): boolean {
        return process.env.IS_STANDBY === "true";
    }
}
