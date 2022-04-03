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

const logger = new IPCLogger("duration");

enum DurationAction {
    ADD = "add",
    REMOVE = "remove",
}

export default class DurationCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "duration",
                type: "number" as const,
                minValue: 2,
                maxValue: 600,
            },
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(DurationAction),
            },
        ],
    };

    help = (guildID: string): Help => ({
        name: "duration",
        description: state.localizer.translate(
            guildID,
            "command.duration.help.description"
        ),
        usage: `,duration [${state.localizer.translate(
            guildID,
            "command.duration.help.usage.minutes"
        )}]`,
        examples: [
            {
                example: "`,duration 15`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.duration.help.example.set",
                    {
                        duration: String(15),
                    }
                ),
            },
            {
                example: "`,duration 5 add`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.duration.help.example.increment",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration 5 remove`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.duration.help.example.decrement",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.duration.help.example.reset"
                ),
            },
        ],
        priority: 110,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.DURATION);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.DURATION, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Duration disabled.`);
            return;
        }

        let duration: number;
        const durationDelta = parseInt(parsedMessage.components[0]);
        if (parsedMessage.components[1]) {
            const action = parsedMessage.components[1] as DurationAction;
            const currentDuration = guildPreference.gameOptions.duration;
            if (action === DurationAction.ADD) {
                if (!guildPreference.isDurationSet()) {
                    duration = durationDelta;
                } else {
                    duration = currentDuration + durationDelta;
                }
            } else if (action === DurationAction.REMOVE) {
                if (!guildPreference.isDurationSet()) {
                    sendErrorMessage(MessageContext.fromMessage(message), {
                        title: state.localizer.translate(
                            message.guildID,
                            "command.duration.failure.removingDuration.title"
                        ),
                        description: state.localizer.translate(
                            message.guildID,
                            "command.duration.failure.removingDuration.notSet.description"
                        ),
                    });
                    return;
                }

                duration = currentDuration - durationDelta;
                if (duration < 2) {
                    sendErrorMessage(MessageContext.fromMessage(message), {
                        title: state.localizer.translate(
                            message.guildID,
                            "command.duration.failure.removingDuration.title"
                        ),
                        description: state.localizer.translate(
                            message.guildID,
                            "command.duration.failure.removingDuration.tooShort.description"
                        ),
                    });
                    return;
                }
            }
        } else {
            duration = parseInt(parsedMessage.components[0]);
        }

        await guildPreference.setDuration(duration);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.DURATION, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Duration set to ${
                guildPreference.gameOptions.duration
            }`
        );
    };
}
