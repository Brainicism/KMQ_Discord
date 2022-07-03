import { IPCLogger } from "../../logger";
import { getDebugLogHeader } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import LocalizationManager from "../../helpers/localization_manager";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("end");

export default class EndCommand implements BaseCommand {
    aliases = ["stop", "e"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "end",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.end.help.description"
        ),
        usage: ",end",
        examples: [],
        priority: 1020,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const session = Session.getSession(message.guildID);
        if (!session) {
            logger.warn(`${getDebugLogHeader(message)} | No active session`);
            return;
        }

        await session.endSession();
        logger.info(`${getDebugLogHeader(message)} | Session ended`);
    };
}
