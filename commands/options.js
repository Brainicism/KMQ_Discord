const { sendOptionsMessage } = require("../helpers/utils.js");

module.exports = {
    call: ({ message, guildPreference }) => {
        sendOptionsMessage(message, guildPreference, null);
    }
}
