import Eris from "eris";
import _logger from "./logger";
import { State } from "./types";
import { registerClientEvents, registerProcessEvents, registerCommands, updateGroupList, registerIntervals } from "./helpers/management_utils";
import { config } from "dotenv";
import { resolve } from "path";
const logger = _logger("kmq");
config({ path: resolve(__dirname, "../.env") })

const ERIS_INTENTS = Eris.Constants.Intents;
const client = new Eris.Client(process.env.BOT_TOKEN, {
    disableEvents: {
        GUILD_DELETE: true,
        GUILD_ROLE_DELETE: true,
        CHANNEL_PINS_UPDATE: true,
        MESSAGE_UPDATE: true,
        MESSAGE_DELETE: true,
        MESSAGE_DELETE_BULK: true,
        MESSAGE_REACTION_REMOVE: true,
        MESSAGE_REACTION_REMOVE_ALL: true,
        MESSAGE_REACTION_REMOVE_EMOJI: true
    },
    restMode: true,
    maxShards: "auto",
    intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions
});


export let state: State = {
    commands: {},
    gameSessions: {},
    botStatsPoster: null,
    client: client
};


(async () => {
    await updateGroupList();
    await registerCommands();
    registerIntervals();
    registerClientEvents(client);
    registerProcessEvents(process);
    client.connect();
})();
