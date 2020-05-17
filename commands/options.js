const { sendOptionsMessage } = require("../helpers/utils.js");

module.exports = {
    call: ({ message, guildPreference, db }) => {
        sendOptionsMessage(message, guildPreference, db, null);
    }
}
