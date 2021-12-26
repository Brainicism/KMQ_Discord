import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("limit");

export const DEFAULT_LIMIT = 500;

export default class LimitCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "limit_1",
                type: "number" as const,
                minValue: 0,
                maxValue: 100000,
            },
            {
                name: "limit_2",
                type: "number" as const,
                minValue: 1,
                maxValue: 100000,
            },
        ],
    };

    help = (guildID: string) => ({
            name: "limit",
            description: state.localizer.translate(guildID,
                "Set a maximum number of results in the song query. This effectively sets the 'Top X number of songs' based on the selected filters."
            ),
            usage: ",limit [limit]",
            examples: [
                {
                    example: "`,limit 250`",
                    explanation: state.localizer.translate(guildID,
                        "Plays the top {{{limit}}} most listened songs from the currently selected options.",
                        {
                            limit: String(250),
                        }
                    ),
                },
                {
                    example: "`,limit 250 500`",
                    explanation: state.localizer.translate(guildID,
                        "Plays between the {{{limit_1}}} to {{{limit_2}}} most listened songs from the currently selected options.",
                        { limit_1: String(250), limit_2: String(500) }
                    ),
                },
                {
                    example: "`,limit`",
                    explanation: state.localizer.translate(guildID,
                        "Reset to the default limit of {{{defaultLimit}}}",
                        { defaultLimit: `\`${DEFAULT_LIMIT}\`` }
                    ),
                },
            ],
        });

    helpPriority = 140;

    call = async ({
        message,
        parsedMessage,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.LIMIT);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.LIMIT, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Limit reset.`);
            return;
        }

        let limitStart: number;
        let limitEnd: number;
        if (parsedMessage.components.length === 1) {
            limitStart = 0;
            limitEnd = parseInt(parsedMessage.components[0]);
            if (limitEnd === 0) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(message.guildID, "Game Option Error"),
                    description: state.localizer.translate(message.guildID,
                        "End limit must be greater than 0"
                    ),
                });
                return;
            }
        } else {
            limitStart = parseInt(parsedMessage.components[0]);
            limitEnd = parseInt(parsedMessage.components[1]);
            if (limitEnd <= limitStart) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(message.guildID, "Game Option Error"),
                    description: state.localizer.translate(message.guildID,
                        "End limit must be greater than start limit"
                    ),
                });
                return;
            }
        }

        await guildPreference.setLimit(limitStart, limitEnd);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.LIMIT, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Limit set to ${
                guildPreference.gameOptions.limitStart
            } - ${guildPreference.gameOptions.limitEnd}`
        );
    };
}
