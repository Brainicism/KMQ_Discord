import Eris from "eris";
import config from "./config/app_config.json";
import { validateConfig } from "./config_validator";
import _logger from "./logger";
import { State } from "./types";
import { registerClientEvents, registerProcessEvents, registerCommands, updateGroupList, registerIntervals } from "./helpers/management_utils";
const logger = _logger("kmq");

const ERIS_INTENTS = Eris.Constants.Intents;
const client = new Eris.Client(config.botToken, {
    disableEvents: {
        GUILD_DELETE: true,
        GUILD_ROLE_CREATE: true,
        GUILD_ROLE_DELETE: true,
        CHANNEL_PINS_UPDATE: true,
        MESSAGE_UPDATE: true,
        MESSAGE_DELETE: true,
        MESSAGE_DELETE_BULK: true,
        MESSAGE_REACTION_REMOVE: true,
        MESSAGE_REACTION_REMOVE_ALL: true,
        MESSAGE_REACTION_REMOVE_EMOJI: true
    },
    intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions
});


export let state: State = {
    commands: {},
    gameSessions: {},
    botStatsPoster: null,
    client: client
};


(async () => {
    if (!validateConfig()) {
        logger.error("Invalid config, aborting.");
        process.exit(1);
    }

    await updateGroupList();
    await registerCommands();
    registerIntervals();
    registerClientEvents(client);
    registerProcessEvents(process);
    client.connect();
})();
