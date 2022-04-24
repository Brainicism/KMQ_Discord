import { GameOption } from "../../enums/game_option_name";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

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

    help = (guildID: string): HelpDocumentation => ({
        name: "duration",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.duration.help.description"
        ),
        usage: `,duration [${LocalizationManager.localizer.translate(
            guildID,
            "command.duration.help.usage.minutes"
        )}]`,
        examples: [
            {
                example: "`,duration 15`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.set",
                    {
                        duration: String(15),
                    }
                ),
            },
            {
                example: "`,duration 5 add`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.increment",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration 5 remove`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.decrement",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.reset"
                ),
            },
        ],
        priority: 110,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.DURATION);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
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
                        title: LocalizationManager.localizer.translate(
                            message.guildID,
                            "command.duration.failure.removingDuration.title"
                        ),
                        description: LocalizationManager.localizer.translate(
                            message.guildID,
                            "command.duration.failure.removingDuration.notSet.description"
                        ),
                    });
                    return;
                }

                duration = currentDuration - durationDelta;
                if (duration < 2) {
                    sendErrorMessage(MessageContext.fromMessage(message), {
                        title: LocalizationManager.localizer.translate(
                            message.guildID,
                            "command.duration.failure.removingDuration.title"
                        ),
                        description: LocalizationManager.localizer.translate(
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
            Session.getSession(message.guildID),
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
