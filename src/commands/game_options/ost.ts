import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("ost");

export enum OstPreference {
    INCLUDE = "include",
    EXCLUDE = "exclude",
    EXCLUSIVE = "exclusive",
}

export const DEFAULT_OST_PREFERENCE = OstPreference.EXCLUDE;

export default class OstCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    aliases = ["osts"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "ostPreference",
                type: "enum" as const,
                enums: Object.values(OstPreference),
            },
        ],
    };

    help = (guildID: string): Help => ({
        name: "ost",
        description: state.localizer.translate(
            guildID,
            "command.ost.help.description"
        ),
        usage: ",ost [include | exclude | exclusive]",
        examples: [
            {
                example: "`,ost include`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.ost.help.example.include"
                ),
            },
            {
                example: "`,ost exclude`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.ost.help.example.exclude"
                ),
            },
            {
                example: "`,ost exclusive`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.ost.help.example.exclusive"
                ),
            },
            {
                example: "`,ost`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.ost.help.example.reset",
                    { defaultOst: `\`${DEFAULT_OST_PREFERENCE}\`` }
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.OST_PREFERENCE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.OST_PREFERENCE, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | OST preference reset.`
            );
            return;
        }

        const ostPreference =
            parsedMessage.components[0].toLowerCase() as OstPreference;

        await guildPreference.setOstPreference(ostPreference);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.OST_PREFERENCE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | OST preference set to ${ostPreference}`
        );
    };
}
