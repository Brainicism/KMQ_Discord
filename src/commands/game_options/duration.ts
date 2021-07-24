import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getDebugLogHeader, sendErrorMessage, sendOptionsMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("duration");

enum DurationAction {
    ADD = "add",
    REMOVE = "remove",
}

export default class DurationCommand implements BaseCommand {
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

    help = {
        name: "duration",
        description: "Sets a maximum length for the KMQ game in minutes.",
        usage: ",duration [minutes]",
        examples: [
            {
                example: "`,duration 15`",
                explanation: "The game will automatically end after 15 minutes.",
            },
            {
                example: "`,duration 5 add`",
                explanation: "Remove 5 minutes from the current game's duration",
            },
            {
                example: "`,duration 5 remove`",
                explanation: "Add 5 minutes to the current game's duration.",
            },
            {
                example: "`,duration`",
                explanation: "Disables the duration",
            },
        ],
        priority: 110,
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.resetDuration();
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.DURATION, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Duration disabled.`);
            return;
        }

        let duration: number;
        const durationDelta = parseInt(parsedMessage.components[0]);
        if (parsedMessage.components[1]) {
            const action = parsedMessage.components[1] as DurationAction;
            const currentDuration = guildPreference.getDuration();
            if (action === DurationAction.ADD) {
                if (!guildPreference.isDurationSet()) {
                    duration = durationDelta;
                } else {
                    duration = currentDuration + durationDelta;
                }
            } else if (action === DurationAction.REMOVE) {
                if (!guildPreference.isDurationSet()) {
                    sendErrorMessage(MessageContext.fromMessage(message), { title: "Error adding/remove duration", description: "The duration is not currently set." });
                    return;
                }

                duration = currentDuration - durationDelta;
                if (duration < 2) {
                    sendErrorMessage(MessageContext.fromMessage(message), { title: "Error removing duration", description: "Duration cannot be less than 2 minutes." });
                    return;
                }
            }
        } else {
            duration = parseInt(parsedMessage.components[0]);
        }

        await guildPreference.setDuration(duration);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.DURATION, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Duration set to ${guildPreference.getDuration()}`);
    };
}
