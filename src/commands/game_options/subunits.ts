import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { GameOption } from "../../types";

const logger = _logger("subunits");

export enum SubunitsPreference {
    INCLUDE = "include",
    EXCLUDE = "exclude",
}

export const DEFAULT_SUBUNIT_PREFERENCE = SubunitsPreference.INCLUDE;

export default class SubunitsCommand implements BaseCommand {
    aliases = ["subunit", "su"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "subunitPreference",
                type: "enum" as const,
                enums: Object.values(SubunitsPreference),
            },
        ],
    };

    help = {
        name: "subunits",
        description: `Choose whether to automatically include a group's subunits, when using \`${process.env.BOT_PREFIX}groups\``,
        usage: "!subunits [include | exclude]",
        examples: [
            {
                example: "`!subunits include`",
                explanation: `Automatically include subunits. For example, \`${process.env.BOT_PREFIX}groups BTS\` would include songs by BTS, J-Hope, RM, etc.`,
            },
            {
                example: "`!subunits exclude`",
                explanation: "Do not include subunits.",
            },
            {
                example: "`!subunits`",
                explanation: `Reset to the default option of \`${DEFAULT_SUBUNIT_PREFERENCE}\``,
            },
        ],
        priority: 130,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            guildPreference.resetSubunitPreference();
            logger.info(`${getDebugLogHeader(message)} | Subunit preference reset.`);
            await sendOptionsMessage(message, guildPreference, { option: GameOption.SUBUNIT_PREFERENCE, reset: true });
            return;
        }

        const subunitPreference = parsedMessage.components[0].toLowerCase() as SubunitsPreference;
        guildPreference.setSubunitPreference(subunitPreference);
        await sendOptionsMessage(message, guildPreference, { option: GameOption.SUBUNIT_PREFERENCE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Subunit preference set to ${subunitPreference}`);
    }
}
