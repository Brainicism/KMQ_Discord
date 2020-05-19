const log4js = require("log4js");
export = (name: string) => {
    log4js.configure("../config/log_config.json");
    return log4js.getLogger(name);
}