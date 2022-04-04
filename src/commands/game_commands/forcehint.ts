import CommandPrechecks from "../../command_prechecks";
import { KmqImages } from "../../constants";
import {
    getDebugLogHeader,
    getMention,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { generateHint, validHintCheck } from "./hint";

const logger = new IPCLogger("forcehint");

export default class ForceHintCommand implements BaseCommand {
    aliases = ["fhint", "fh"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.forcehint.help.description"
        ),
        examples: [],
        name: "forcehint",
        priority: 1009,
        usage: ",forcehint",
    });

    call = async ({ gameSessions, message }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession?.round;
        const guildPreference = await getGuildPreference(message.guildID);

        if (!validHintCheck(gameSession, guildPreference, gameRound, message))
            return;
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                description: state.localizer.translate(
                    message.guildID,
                    "command.forcehint.failure.notOwner.description",
                    { mentionedUser: getMention(gameSession.owner.id) }
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "command.forcehint.failure.notOwner.title"
                ),
            });
            return;
        }

        gameRound.hintRequested(message.author.id);
        gameRound.hintUsed = true;
        await sendInfoMessage(MessageContext.fromMessage(message), {
            description: generateHint(
                message.guildID,
                guildPreference.gameOptions.guessModeType,
                gameRound
            ),
            thumbnailUrl: KmqImages.READING_BOOK,
            title: state.localizer.translate(
                message.guildID,
                "command.hint.title"
            ),
        });
        logger.info(`${getDebugLogHeader(message)} | Owner force-hinted.`);
    };
}
