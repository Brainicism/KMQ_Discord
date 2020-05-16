const { sendOptionsMessage } = require("../helpers/utils.js");

module.exports = {
    call: ({ message, guildPreference }) => {
        sendOptionsMessage(message, guildPreference, null);
    },
    help: {
        name: "options",
        description: "Displays the current game options.",
        usage: "!options",
        arguments: []
    }
}
