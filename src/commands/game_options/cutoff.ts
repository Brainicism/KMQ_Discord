import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("cutoff");

export const DEFAULT_BEGINNING_SEARCH_YEAR = 1990;
export const DEFAULT_ENDING_SEARCH_YEAR = new Date().getFullYear();

export default class CutoffCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
                minValue: DEFAULT_BEGINNING_SEARCH_YEAR,
                name: "cutoff_start",
                type: "number" as const,
            },
            {
                maxValue: DEFAULT_ENDING_SEARCH_YEAR,
                minValue: DEFAULT_BEGINNING_SEARCH_YEAR,
                name: "cutoff_end",
                type: "number" as const,
            },
        ],
        maxArgCount: 2,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.cutoff.help.description"
        ),
        examples: [
            {
                example: "`,cutoff 2015`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.cutoff.help.example.singleCutoff",
                    {
                        year: String(2015),
                    }
                ),
            },
            {
                example: "`,cutoff 2015 2018`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.cutoff.help.example.twoCutoffs",
                    {
                        beginningYear: String(2015),
                        endYear: String(2018),
                    }
                ),
            },
            {
                example: "`,cutoff`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.cutoff.help.example.reset",
                    {
                        defaultBeginningSearchYear: String(
                            DEFAULT_BEGINNING_SEARCH_YEAR
                        ),
                        defaultEndSearchYear: String(
                            DEFAULT_ENDING_SEARCH_YEAR
                        ),
                    }
                ),
            },
        ],
        name: "cutoff",
        priority: 140,
        usage: ",cutoff [year_start] {year_end}",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.setBeginningCutoffYear(
                DEFAULT_BEGINNING_SEARCH_YEAR
            );
            await guildPreference.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.CUTOFF, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | Cutoff set to ${
                    guildPreference.gameOptions.beginningYear
                } - ${guildPreference.gameOptions.endYear}`
            );
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
                await sendErrorMessage(MessageContext.fromMessage(message), {
                    description: state.localizer.translate(
                        message.guildID,
                        "command.cutoff.failure.invalidEndYear.description"
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "command.cutoff.failure.invalidEndYear.title"
                    ),
                });
                return;
            }

            await guildPreference.setBeginningCutoffYear(parseInt(startYear));
            await guildPreference.setEndCutoffYear(parseInt(endYear));
        }

        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.CUTOFF, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Cutoff set to ${
                guildPreference.gameOptions.beginningYear
            } - ${guildPreference.gameOptions.endYear}`
        );
    };
}
