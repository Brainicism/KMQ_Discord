import _logger from "./logger";
const logger = _logger("config_validator");

const allowedOptions = {
    botToken: { required: true },
    dbUser: { required: true },
    dbPassword: { required: true },
    songCacheDir: { required: true },
    topGGToken: { required: false },
    discordBotsGgToken: { required: false },
    newsFile: { required: true },
    groupListFile: { required: true },
    songAliasesFile: { required: true },
    restartCron: { required: false }
};

export function validateConfig(config): boolean {
    let valid = true;
    //check for extraneous config options
    for (let option in config) {
        if (!(option in allowedOptions)) {
            logger.error(`Unknown configuration option: ${option}`);
            valid = false;
        }
    }
    //check for required config options
    for (let option in allowedOptions) {
        const optionRequired = allowedOptions[option].required;
        if (optionRequired && !(option in config)) {
            logger.error(`Missing required configuration option: ${option}`);
            valid = false;
        }
    }
    return valid;

}
