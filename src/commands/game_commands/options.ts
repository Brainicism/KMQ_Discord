import {
    sendOptionsMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import type BaseCommand from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import LocalizationManager from "../../helpers/localization_manager";

const logger = new IPCLogger("options");

export default class OptionsCommand implements BaseCommand {
    aliases = ["settings"];

    help = (guildID: string): HelpDocumentation => ({
        name: "options",
        description: LocalizationManager.localizer.translate(
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
