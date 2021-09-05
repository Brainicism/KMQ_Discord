import Eris from "eris";
import { IPCLogger } from "../../logger";
import { sendOptionsMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq";
import validate from "../../helpers/validate";
import { GuildTextableMessage, ParsedMessage } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("messageCreate");

function isGuildMessage(message: Eris.Message): message is GuildTextableMessage {
    return (message.channel instanceof Eris.TextChannel);
}

const parseMessage = (message: string): ParsedMessage => {
    if (message.charAt(0) !== process.env.BOT_PREFIX) return null;
    const components = message.split(/\s+/);
    const action = components.shift().substring(1).toLowerCase();
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
    if (!isGuildMessage(message)) return;
    if (state.client.unavailableGuilds.has(message.guildID)) {
        logger.warn(`Server was unavailable. id = ${message.guildID}`);
        return;
    }

    const parsedMessage = parseMessage(message.content) || null;
    const textChannel = message.channel as Eris.TextChannel;
    if (message.mentions.includes(state.client.user) && message.content.split(" ").length === 1) {
        // Any message that mentions the bot sends the current options
        const guildPreference = await getGuildPreference(message.guildID);
        sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, null);
        return;
    }

    const invokedCommand = parsedMessage ? state.client.commands[parsedMessage.action] : null;
    if (invokedCommand) {
        if (validate(message, parsedMessage, invokedCommand.validations, invokedCommand.help?.usage)) {
            const { gameSessions } = state;
            if (invokedCommand.preRunChecks) {
                const preCheckResult = invokedCommand.preRunChecks.every((precheck) => precheck(message, gameSessions[message.guildID]));
                if (!preCheckResult) return;
            }

            invokedCommand.call({
                gameSessions,
                channel: textChannel,
                message,
                parsedMessage,
            });
        }
    } else if (state.gameSessions[message.guildID]?.gameRound) {
        const gameSession = state.gameSessions[message.guildID];
        gameSession.guessSong(MessageContext.fromMessage(message), message.content);
    }
}
