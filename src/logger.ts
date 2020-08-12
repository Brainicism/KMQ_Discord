import * as log4js from "log4js";
import * as path from "path";
export default (name: string): log4js.Logger => {
    log4js.configure(path.resolve(__dirname, "../config/log_config.json"));
    return log4js.getLogger(name);
}
