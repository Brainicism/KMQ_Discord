const { sendOptionsMessage } = require("../helpers/utils.js");

module.exports = {
    call: ({ message, guildPreference, db }) => {
        sendOptionsMessage(message, guildPreference, db, null);
    },
    help: {
        name: "options",
        description: "Displays the current game options.",
        usage: "!options",
        arguments: []
    }
}
