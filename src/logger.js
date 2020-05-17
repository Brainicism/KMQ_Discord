const log4js = require('log4js');
module.exports = (name) => {
    log4js.configure('../config/log_config.json');
    return log4js.getLogger(name);
}