const { sendOptionsMessage } = require("../helpers/utils");
import { Message } from "discord.js"
import GuildPreference from "../models/guild_preference"
import { Pool } from "promise-mysql"
function call({ message, guildPreference, db }: { message: Message, guildPreference: GuildPreference, db: Pool }) {
    sendOptionsMessage(message, guildPreference, db, null);
}
const help = {
    name: "options",
    description: "Displays the current game options.",
    usage: "!options",
    arguments: []
}


export {
    call,
    help
}
