import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("typo");

export enum TypoType {
    DISALLOW = "disallow",
    ALLOW = "allow",
}
export const DEFAULT_TYPO_TYPE = TypoType.DISALLOW;

export default class TypoCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    aliases = ["typos"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "typo",
                type: "enum" as const,
                enums: Object.values(TypoType),
            },
        ],
    };

    help = {
        name: "typo",
        description:
            "Choose whether to allow minor typos in guesses",
        usage: ",typo [allow | disallow]",
        examples: [
            {
                example: "`,typo allow`",
                explanation: "Allow minor typos in guesses",
            },
            {
                example: "`,typo disallow`",
                explanation:
                    "Disallow typos in guesses. Guesses must be equivalent to the correct answer",
            },
            {
                example: "`,typo`",
                explanation: `Reset to the default typo type of \`${DEFAULT_TYPO_TYPE}\``,
            },
        ],
        priority: 130,
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.TYPO_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.TYPO_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Typo type reset.`);
            return;
        }

        const typoType =
            parsedMessage.components[0].toLowerCase() as TypoType;

        await guildPreference.setTypoType(typoType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.TYPO_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Typo type set to ${typoType}`
        );
    };
}
