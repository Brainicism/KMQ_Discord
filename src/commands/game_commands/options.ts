import {
    sendOptionsMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("options");

export default class OptionsCommand implements BaseCommand {
    helpPriority = 50;

    help = (guildID: string): Help => ({
        name: "options",
        description: state.localizer.translate(
            guildID,
            "options.help.description"
        ),
        usage: ",options",
        examples: [],
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
