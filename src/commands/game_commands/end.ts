import BaseCommand from "../interfaces/base_command";
import { getDebugLogHeader } from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";
import Session from "../../structures/session";
import CommandArgs from "../../interfaces/command_args";
import HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("end");

export default class EndCommand implements BaseCommand {
    aliases = ["stop", "e"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "end",
        description: state.localizer.translate(
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
