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

const logger = new IPCLogger("language");

export enum LanguageType {
    KOREAN = "korean",
    ALL = "all",
}

export const DEFAULT_LANGUAGE = LanguageType.ALL;

// z = chinese, j = japanese, e = english, s = spanish
export const FOREIGN_LANGUAGE_TAGS = ["z", "j", "e", "s"];
export default class LanguageCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(LanguageType),
                name: "language",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.language.help.description"
        ),
        examples: [
            {
                example: "`,language korean`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.language.help.example.korean"
                ),
            },
            {
                example: "`,language all`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.language.help.example.all"
                ),
            },
            {
                example: "`,language`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.language.help.example.reset",
                    { defaultLanguage: `\`${LanguageType.ALL}\`` }
                ),
            },
        ],
        name: "language",
        priority: 150,
        usage: ",language [korean | all]",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.LANGUAGE_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.LANGUAGE_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Language type reset.`);
            return;
        }

        const languageType = parsedMessage.components[0] as LanguageType;
        await guildPreference.setLanguageType(languageType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.LANGUAGE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Language type set to ${languageType}`
        );
    };
}
