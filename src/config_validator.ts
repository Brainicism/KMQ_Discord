import _logger from "./logger";
import config from "./config/app_config.json";
const logger = _logger("config_validator");

const allowedOptions = {
    botToken: { required: true },
    dbUser: { required: true },
    dbPassword: { required: true },
    songCacheDir: { required: true },
    topGGToken: { required: false },
    discordBotsGgToken: { required: false },
    discordBotListToken: { required: false },
    restartCron: { required: false }
};

export function validateConfig(): boolean {
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
