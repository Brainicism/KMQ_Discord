import BaseCommand, { CommandArgs } from "../base_command";
import {
    sendErrorMessage,
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import { generateHint, validHintCheck } from "./hint";

const logger = _logger("forcehint");

export default class ForceHintCommand implements BaseCommand {
    help = {
        name: "forcehint",
        description: "The person that started the game can force-hint the current song, no majority necessary.",
        usage: ",forcehint",
        examples: [],
        priority: 1009,
    };

    aliases = ["fhint", "fh"];

    async call({ gameSessions, message }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        const gameRound = gameSession?.gameRound;

        if (!validHintCheck(gameSession, gameRound, message)) return;
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Force hint ignored", description: `Only the person who started the game (${bold(gameSession.owner.tag)}) can force-hint.` });
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);
        gameRound.hintRequested(message.author.id);
        logger.info(`${getDebugLogHeader(message)} | Owner force-hinted.`);
        gameRound.hintUsed = true;
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Hint", description: generateHint(guildPreference.getGuessModeType(), gameRound), thumbnailUrl: KmqImages.READING_BOOK });
    }
}
