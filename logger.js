const log4js = require('log4js');
module.exports = (name) => {
    log4js.configure('./log4js.json');
    return log4js.getLogger(name);
}