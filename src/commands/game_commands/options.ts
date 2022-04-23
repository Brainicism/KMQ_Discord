import {
    sendOptionsMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import BaseCommand from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import CommandArgs from "../../interfaces/command_args";
import HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("options");

export default class OptionsCommand implements BaseCommand {
    aliases = ["settings"];

    help = (guildID: string): HelpDocumentation => ({
        name: "options",
        description: State.localizer.translate(
            guildID,
            "command.options.help.description"
        ),
        usage: ",options",
        examples: [],
        priority: 50,
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
