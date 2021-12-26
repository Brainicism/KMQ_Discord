import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { getDebugLogHeader } from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("end");

export default class EndCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
            name: "end",
            description: state.localizer.translate(guildID,
                "Finishes the current game and decides on a winner."
            ),
            usage: ",end",
            examples: [],
        });

    helpPriority = 1020;

    aliases = ["stop", "e"];

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
