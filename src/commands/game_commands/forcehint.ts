import type BaseCommand from "../interfaces/base_command";
import {
    sendErrorMessage,
    getDebugLogHeader,
    sendInfoMessage,
    getMention,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import { generateHint, validHintCheck } from "./hint";
import CommandPrechecks from "../../command_prechecks";
import State from "../../state";
import Session from "../../structures/session";
import type GameSession from "src/structures/game_session";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("forcehint");

export default class ForceHintCommand implements BaseCommand {
    aliases = ["fhint", "fh"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "forcehint",
        description: State.localizer.translate(
            guildID,
            "command.forcehint.help.description"
        ),
        usage: ",forcehint",
        examples: [],
        priority: 1009,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const gameSession = Session.getSession(message.guildID) as GameSession;
        const gameRound = gameSession?.round;
        const guildPreference = await getGuildPreference(message.guildID);

        if (!validHintCheck(gameSession, guildPreference, gameRound, message))
            return;
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: State.localizer.translate(
                    message.guildID,
                    "command.forcehint.failure.notOwner.title"
                ),
                description: State.localizer.translate(
                    message.guildID,
                    "command.forcehint.failure.notOwner.description",
                    { mentionedUser: getMention(gameSession.owner.id) }
                ),
            });
            return;
        }

        gameRound.hintRequested(message.author.id);
        gameRound.hintUsed = true;
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: State.localizer.translate(
                message.guildID,
                "command.hint.title"
            ),
            description: generateHint(
                message.guildID,
                guildPreference.gameOptions.guessModeType,
                gameRound
            ),
            thumbnailUrl: KmqImages.READING_BOOK,
        });
        logger.info(`${getDebugLogHeader(message)} | Owner force-hinted.`);
    };
}
