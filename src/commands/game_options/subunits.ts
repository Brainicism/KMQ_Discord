import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("subunits");

export enum SubunitsPreference {
    INCLUDE = "include",
    EXCLUDE = "exclude",
}

export const DEFAULT_SUBUNIT_PREFERENCE = SubunitsPreference.INCLUDE;

export default class SubunitsCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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
        usage: ",subunits [include | exclude]",
        examples: [
            {
                example: "`,subunits include`",
                explanation: `Automatically include subunits. For example, \`${process.env.BOT_PREFIX}groups BTS\` would include songs by BTS, J-Hope, RM, etc.`,
            },
            {
                example: "`,subunits exclude`",
                explanation: "Do not include subunits.",
            },
            {
                example: "`,subunits`",
                explanation: `Reset to the default option of \`${DEFAULT_SUBUNIT_PREFERENCE}\``,
            },
        ],
        priority: 130,
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SUBUNIT_PREFERENCE);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.SUBUNIT_PREFERENCE, reset: true }]);
            logger.info(`${getDebugLogHeader(message)} | Subunit preference reset.`);
            return;
        }

        const subunitPreference = parsedMessage.components[0].toLowerCase() as SubunitsPreference;
        await guildPreference.setSubunitPreference(subunitPreference);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.SUBUNIT_PREFERENCE, reset: false }]);
        logger.info(`${getDebugLogHeader(message)} | Subunit preference set to ${subunitPreference}`);
    };
}
