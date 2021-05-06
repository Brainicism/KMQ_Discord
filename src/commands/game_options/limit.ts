import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugLogHeader, sendErrorMessage, sendOptionsMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("limit");
export const DEFAULT_LIMIT = 500;

export default class LimitCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "limit_1",
                type: "number" as const,
                minValue: 0,
                maxValue: 10000,
            },
            {
                name: "limit_2",
                type: "number" as const,
                minValue: 1,
                maxValue: 10000,
            },
        ],
    };

    help = {
        name: "limit",
        description: "Set a maximum number of results in the song query. This effectively sets the 'Top X number of songs' based on the selected filters.",
        usage: ",limit [limit]",
        examples: [
            {
                example: "`,limit 250`",
                explanation: "Plays the top 250 most listened songs from the currently selected options.",
            },
            {
                example: "`,limit 250 500`",
                explanation: "Plays between the 250th to 500th most listened songs from the currently selected options.",
            },
            {
                example: "`,limit`",
                explanation: `Reset to the default limit of \`${DEFAULT_LIMIT}\``,
            },
        ],
        priority: 140,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.resetLimit();
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.LIMIT, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Limit reset.`);
            return;
        }
        let limitStart: number;
        let limitEnd: number;
        if (parsedMessage.components.length === 1) {
            limitStart = 0;
            limitEnd = parseInt(parsedMessage.components[0]);
            if (limitEnd === 0) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "Game Option Error", description: "End limit must be greater than 0" });
                return;
            }
        } else {
            limitStart = parseInt(parsedMessage.components[0]);
            limitEnd = parseInt(parsedMessage.components[1]);
            if (limitEnd <= limitStart) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "Game Option Error", description: "End limit must be greater than start limit" });
                return;
            }
        }
        await guildPreference.setLimit(limitStart, limitEnd);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.LIMIT, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Limit set to ${guildPreference.getLimitStart()} - ${guildPreference.getLimitEnd()}`);
    }
}
