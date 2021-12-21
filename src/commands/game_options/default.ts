import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("default");

export default class DefaultCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    aliases = ["setdefault", "setdefaults", "defaults"];

    help = {
        name: "default",
        description: `Sets the current game option as the defaults (for ${process.env.BOT_PREFIX}reset or per-option resets). This should only be used by experienced users!`,
        usage: ",default",
        examples: [
            {
                example: "`,default`",
                explanation: "Sets the current game option as the defaults.",
            },
        ],
        priority: 130,
    };

    call = async ({ message }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        await guildPreference.setAsDefault();
        logger.info(`${getDebugLogHeader(message)} | Set default game options`);

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Success!",
            description:
                "Default game options has been set to the current options!",
        });
    };
}
