import * as log4js from "log4js";
export default (name: string): log4js.Logger => {
    log4js.configure("../config/log_config.json");
    return log4js.getLogger(name);
}