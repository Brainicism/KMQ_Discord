import log4js from "log4js";
import logConfig from "./config/log_config.json";
export default (name: string): log4js.Logger => {
    log4js.configure(logConfig);
    return log4js.getLogger(name);
}
