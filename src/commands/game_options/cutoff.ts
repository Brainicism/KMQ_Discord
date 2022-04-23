import BaseCommand from "../interfaces/base_command";
import {
    sendOptionsMessage,
    getDebugLogHeader,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../enums/game_option_name";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import State from "../../state";
import HelpDocumentation from "../../interfaces/help";
import CommandArgs from "../../interfaces/command_args";
import {
    DEFAULT_BEGINNING_SEARCH_YEAR,
    DEFAULT_ENDING_SEARCH_YEAR,
} from "../../constants";

const logger = new IPCLogger("cutoff");

export default class CutoffCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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

    help = (guildID: string): HelpDocumentation => ({
        name: "cutoff",
        description: State.localizer.translate(
            guildID,
            "command.cutoff.help.description"
        ),
        usage: ",cutoff [year_start] {year_end}",
        examples: [
            {
                example: "`,cutoff 2015`",
                explanation: State.localizer.translate(
                    guildID,
                    "command.cutoff.help.example.singleCutoff",
                    {
                        year: String(2015),
                    }
                ),
            },
            {
                example: "`,cutoff 2015 2018`",
                explanation: State.localizer.translate(
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
                explanation: State.localizer.translate(
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
        priority: 140,
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
                    title: State.localizer.translate(
                        message.guildID,
                        "command.cutoff.failure.invalidEndYear.title"
                    ),
                    description: State.localizer.translate(
                        message.guildID,
                        "command.cutoff.failure.invalidEndYear.description"
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
