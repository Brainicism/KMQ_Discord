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

const logger = new IPCLogger("limit");

export const DEFAULT_LIMIT = 500;

export default class LimitCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                maxValue: 100000,
                minValue: 0,
                name: "limit_1",
                type: "number" as const,
            },
            {
                maxValue: 100000,
                minValue: 1,
                name: "limit_2",
                type: "number" as const,
            },
        ],
        maxArgCount: 2,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.limit.help.description"
        ),
        examples: [
            {
                example: "`,limit 250`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.limit.help.example.singleLimit",
                    {
                        limit: String(250),
                    }
                ),
            },
            {
                example: "`,limit 250 500`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.limit.help.example.twoLimits",
                    { limitEnd: String(500), limitStart: String(250) }
                ),
            },
            {
                example: "`,limit`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.limit.help.example.reset",
                    { defaultLimit: `\`${DEFAULT_LIMIT}\`` }
                ),
            },
        ],
        name: "limit",
        priority: 140,
        usage: ",limit [limit_1] {limit_2}",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
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
                    description: state.localizer.translate(
                        message.guildID,
                        "command.limit.failure.invalidLimit.greaterThanZero.description"
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "command.limit.failure.invalidLimit.title"
                    ),
                });
                return;
            }
        } else {
            limitStart = parseInt(parsedMessage.components[0]);
            limitEnd = parseInt(parsedMessage.components[1]);
            if (limitEnd <= limitStart) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    description: state.localizer.translate(
                        message.guildID,
                        "command.limit.failure.invalidLimit.greaterThanStart.description"
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "command.limit.failure.invalidLimit.title"
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
