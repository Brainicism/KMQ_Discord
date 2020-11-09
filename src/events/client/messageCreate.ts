import Eris from "eris";
import _logger from "../../logger";
import { textPermissionsCheck } from "../../helpers/discord_utils";
import state from "../../kmq";
import validate from "../../helpers/validate";
import { ParsedMessage } from "../../types";

const logger = _logger("messageCreate");

function isGuildMessage(message: Eris.Message): message is Eris.Message<Eris.GuildTextableChannel> {
    return (message.channel instanceof Eris.TextChannel);
}

const parseMessage = (message: string): ParsedMessage => {
    if (message.charAt(0) !== process.env.PREFIX) return null;
    const components = message.split(" ");
    const action = components.shift().substring(1);
    const argument = components.join(" ");
    return {
        action,
        argument,
        message,
        components,
    };
};

export default async function messageCreateHandler(message: Eris.Message) {
    if (message.author.id === state.client.user.id || message.author.bot) return;
    if (!message.guildID) {
        logger.info(`Received message in DMs: message = ${message.content}`);
        return;
    }
    if (!isGuildMessage(message)) return;
    if (state.client.unavailableGuilds.has(message.guildID)) {
        logger.warn(`Server was unavailable. id = ${message.guildID}`);
        return;
    }

    const parsedMessage = parseMessage(message.content) || null;
    if (message.mentions.includes(state.client.user) && message.content.split(" ").length === 1) {
        // Any message that mentions the bot sends the current options
        if (!(await textPermissionsCheck(message))) {
            return;
        }
        state.commands.options.call({ message });
    }

    if (parsedMessage && state.commands[parsedMessage.action]) {
        const command = state.commands[parsedMessage.action];
        if (validate(message, parsedMessage, command.validations)) {
            if (!(await textPermissionsCheck(message))) {
                return;
            }
            const { gameSessions } = state;
            command.call({
                gameSessions,
                message,
                parsedMessage,
            });
        }
    } else if (state.gameSessions[message.guildID] && state.gameSessions[message.guildID].gameRound) {
        const gameSession = state.gameSessions[message.guildID];
        gameSession.guessSong({ message });
    }
}
