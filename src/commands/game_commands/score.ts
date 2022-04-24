import type BaseCommand from "../interfaces/base_command";
import {
    sendScoreboardMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import CommandPrechecks from "../../command_prechecks";
import Session from "../../structures/session";
import type GameSession from "../../structures/game_session";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import LocalizationManager from "../../helpers/localization_manager";

const logger = new IPCLogger("score");

export default class ScoreCommand implements BaseCommand {
    aliases = ["scoreboard", "sb"];

    preRunChecks = [{ checkFn: CommandPrechecks.notMusicPrecheck }];

    help = (guildID: string): HelpDocumentation => ({
        name: "score",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.score.help.description"
        ),
        usage: ",score",
        examples: [],
        priority: 50,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const gameSession = Session.getSession(message.guildID) as GameSession;
        await sendScoreboardMessage(message, gameSession);
        logger.info(`${getDebugLogHeader(message)} | Score retrieved`);
    };
}
