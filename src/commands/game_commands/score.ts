import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendScoreboardMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import LocalizationManager from "../../helpers/localization_manager";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameSession from "../../structures/game_session";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("score");

export default class ScoreCommand implements BaseCommand {
    aliases = ["scoreboard", "sb"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

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
