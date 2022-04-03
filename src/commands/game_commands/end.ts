import CommandPrechecks from "../../command_prechecks";
import { getDebugLogHeader } from "../../helpers/discord_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("end");

export default class EndCommand implements BaseCommand {
    aliases = ["stop", "e"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
        name: "end",
        description: state.localizer.translate(
            guildID,
            "command.end.help.description"
        ),
        usage: ",end",
        examples: [],
        priority: 1020,
    });

    call = async ({ gameSessions, message }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            logger.warn(
                `${getDebugLogHeader(message)} | No active game session`
            );
            return;
        }

        await gameSession.endSession();
        logger.info(`${getDebugLogHeader(message)} | Game session ended`);
    };
}
