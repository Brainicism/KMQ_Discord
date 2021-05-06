import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("ost");
export enum OstPreference {
    INCLUDE = "include",
    EXCLUDE = "exclude",
    EXCLUSIVE = "exclusive",
}

export const DEFAULT_OST_PREFERENCE = OstPreference.EXCLUDE;

export default class OstCommand implements BaseCommand {
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

    help = {
        name: "ost",
        description: "Choose whether to include OST songs",
        usage: ",ost [include | exclude]",
        examples: [
            {
                example: "`,ost include`",
                explanation: "Include OST songs.",
            },
            {
                example: "`,ost exclude`",
                explanation: "Exclude OST songs.",
            },
            {
                example: "`,ost exclusive`",
                explanation: "Exclusively play OST songs.",
            },
            {
                example: "`,ost`",
                explanation: `Reset to the default option of \`${DEFAULT_OST_PREFERENCE}\``,
            },
        ],
        priority: 130,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.resetOstPreference();
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.OST_PREFERENCE, reset: true });
            logger.info(`${getDebugLogHeader(message)} | OST preference reset.`);
            return;
        }

        const ostPreference = parsedMessage.components[0].toLowerCase() as OstPreference;
        await guildPreference.setOstPreference(ostPreference);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.OST_PREFERENCE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | OST preference set to ${ostPreference}`);
    }
}
