import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
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
import { state } from "../../kmq_worker";

const logger = new IPCLogger("forcehint");

export default class ForceHintCommand implements BaseCommand {
    aliases = ["fhint", "fh"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
        name: "forcehint",
        description: state.localizer.translate(
            guildID,
            "forcehint.help.description"
        ),
        usage: ",forcehint",
        examples: [],
        priority: 1009,
    });

    call = async ({ gameSessions, message }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession?.gameRound;
        const guildPreference = await getGuildPreference(message.guildID);

        if (!validHintCheck(gameSession, guildPreference, gameRound, message))
            return;
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "forcehint.failure.notOwner.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "forcehint.failure.notOwner.description",
                    { mentionedUser: getMention(gameSession.owner.id) }
                ),
            });
            return;
        }

        gameRound.hintRequested(message.author.id);
        gameRound.hintUsed = true;
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(message.guildID, "hint.title"),
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
