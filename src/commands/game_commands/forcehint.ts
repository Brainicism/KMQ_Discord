import BaseCommand, { CommandArgs } from "../interfaces/base_command";
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

const logger = new IPCLogger("forcehint");

export default class ForceHintCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.inGameCommandPrecheck }, { checkFn: CommandPrechecks.competitionPrecheck }];

    help = {
        name: "forcehint",
        description: "The person that started the game can force-hint the current song, no majority necessary.",
        usage: ",forcehint",
        examples: [],
        priority: 1009,
    };

    aliases = ["fhint", "fh"];

    call = async ({ gameSessions, message }: CommandArgs) => {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession?.gameRound;
        const guildPreference = await getGuildPreference(message.guildID);

        if (!validHintCheck(gameSession, guildPreference, gameRound, message)) return;
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Force Hint Ignored", description: `Only the person who started the game (${getMention(gameSession.owner.id)}) can force-hint.` });
            return;
        }

        gameRound.hintRequested(message.author.id);
        gameRound.hintUsed = true;
        await sendInfoMessage(MessageContext.fromMessage(message), { title: "Hint", description: generateHint(guildPreference.gameOptions.guessModeType, gameRound), thumbnailUrl: KmqImages.READING_BOOK });
        logger.info(`${getDebugLogHeader(message)} | Owner force-hinted.`);
    };
}
