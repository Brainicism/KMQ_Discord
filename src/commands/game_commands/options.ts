import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("options");

export default class OptionsCommand implements BaseCommand {
    aliases = ["settings"];

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.options.help.description"
        ),
        examples: [],
        name: "options",
        priority: 50,
        usage: ",options",
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            null
        );
        logger.info(`${getDebugLogHeader(message)} | Options retrieved`);
    };
}
