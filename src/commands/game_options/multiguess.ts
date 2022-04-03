import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("multiguess");

export enum MultiGuessType {
    ON = "on",
    OFF = "off",
}

export const DEFAULT_MULTIGUESS_TYPE = MultiGuessType.ON;

export default class MultiGuessCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(MultiGuessType),
                name: "multiguess_type",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.multiguess.help.description",
            { on: `\`${MultiGuessType.ON}\`` }
        ),
        examples: [
            {
                example: "`,multiguess on`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.on"
                ),
            },
            {
                example: "`,multiguess off`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.off"
                ),
            },
            {
                example: "`,multiguess`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.reset",
                    { defaultMultiguess: `\`${DEFAULT_MULTIGUESS_TYPE}\`` }
                ),
            },
        ],
        name: "multiguess",
        priority: 150,
        usage: ",multiguess [on | off]",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.MULTIGUESS);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.MULTIGUESS, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | Multiguess type reset.`
            );
            return;
        }

        const multiGuessType = parsedMessage.components[0] as MultiGuessType;
        await guildPreference.setMultiGuessType(multiGuessType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.MULTIGUESS, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Multiguess type set to ${multiGuessType}`
        );
    };
}
