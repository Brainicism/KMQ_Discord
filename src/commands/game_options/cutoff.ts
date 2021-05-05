import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("cutoff");
export const DEFAULT_BEGINNING_SEARCH_YEAR = 2008;
export const DEFAULT_ENDING_SEARCH_YEAR = (new Date()).getFullYear();

export default class CutoffCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "cutoff_start",
                type: "number" as const,
                minValue: DEFAULT_BEGINNING_SEARCH_YEAR,
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
            },
            {
                name: "cutoff_end",
                type: "number" as const,
                minValue: DEFAULT_BEGINNING_SEARCH_YEAR,
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
            },
        ],
    };

    help = {
        name: "cutoff",
        description: "Set a cutoff year range for songs. If one value is specified, only songs AFTER that year will be played. If two values are specified, only songs BETWEEN those two years will be played",
        usage: ",cutoff [year_start] {year_end}",
        examples: [
            {
                example: "`,cutoff 2015`",
                explanation: "Play songs released after the year 2015.",
            },
            {
                example: "`,cutoff 2015 2018`",
                explanation: "Play songs released between the years 2015-2018.",
            },
            {
                example: "`,cutoff`",
                explanation: `Reset to the default cutoff of \`${DEFAULT_BEGINNING_SEARCH_YEAR}\` to \`${DEFAULT_ENDING_SEARCH_YEAR}\``,
            },
        ],
        priority: 140,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.setBeginningCutoffYear(DEFAULT_BEGINNING_SEARCH_YEAR);
            await guildPreference.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.CUTOFF, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Cutoff set to ${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`);
            return;
        }
        const yearRange = parsedMessage.components;
        const startYear = yearRange[0];
        if (yearRange.length === 1) {
            await guildPreference.setBeginningCutoffYear(parseInt(startYear));
            await guildPreference.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
        } else if (yearRange.length === 2) {
            const endYear = yearRange[1];
            if (endYear < startYear) {
                await sendErrorMessage(MessageContext.fromMessage(message), { title: "Invalid end year", description: "End year must be after or equal to start year" });
                return;
            }
            await guildPreference.setBeginningCutoffYear(parseInt(startYear));
            await guildPreference.setEndCutoffYear(parseInt(endYear));
        }
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.CUTOFF, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Cutoff set to ${guildPreference.getBeginningCutoffYear()} - ${guildPreference.getEndCutoffYear()}`);
    }
}
