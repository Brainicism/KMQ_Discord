const { sendInfoMessage } = require("../helpers/utils.js");

module.exports = {
    call: ({ message, guildPreference }) => {
        let beginningYear = guildPreference.getBeginningCutoffYear();
        let gender = guildPreference.getSQLGender();
        let limit = guildPreference.getLimit();
        let volume = guildPreference.getVolume();
        sendInfoMessage(message,
            "Options",
            `Now playing the \`${limit}\` most popular songs by \`${gender}\` artists starting from the year \`${beginningYear}\` at \`${volume}\`% volume.`
        );
    }
}
