const { EMBED_INFO_COLOR } = require("../helpers/utils.js");

module.exports = {
    call: ({ message }) => {
        message.channel.send({
            embed: {
                color: EMBED_INFO_COLOR,
                author: {
                    name: message.author.username,
                    icon_url: message.author.avatarURL()
                },
                title: "**GIVE ME YOUR MONEY**",
            }
        })
        .then((message) => message.delete({ timeout: 100 }));
    }
}
