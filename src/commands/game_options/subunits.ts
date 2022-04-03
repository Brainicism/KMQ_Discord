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

const logger = new IPCLogger("subunits");

export enum SubunitsPreference {
    INCLUDE = "include",
    EXCLUDE = "exclude",
}

export const DEFAULT_SUBUNIT_PREFERENCE = SubunitsPreference.INCLUDE;

export default class SubunitsCommand implements BaseCommand {
    aliases = ["subunit", "su"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(SubunitsPreference),
                name: "subunitPreference",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.subunits.help.description",
            { groups: `\`${process.env.BOT_PREFIX}groups\`` }
        ),
        examples: [
            {
                example: "`,subunits include`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.subunits.help.example.include",
                    {
                        groupCommand: `${process.env.BOT_PREFIX}groups`,
                        parentGroup: "BTS",
                        subunitOne: "J-Hope",
                        subunitTwo: "RM",
                    }
                ),
            },
            {
                example: "`,subunits exclude`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.subunits.help.example.exclude"
                ),
            },
            {
                example: "`,subunits`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.subunits.help.example.reset",
                    { defaultSubunit: `\`${DEFAULT_SUBUNIT_PREFERENCE}\`` }
                ),
            },
        ],
        name: "subunits",
        priority: 130,
        usage: ",subunits [include | exclude]",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SUBUNIT_PREFERENCE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.SUBUNIT_PREFERENCE, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | Subunit preference reset.`
            );
            return;
        }

        const subunitPreference =
            parsedMessage.components[0].toLowerCase() as SubunitsPreference;

        await guildPreference.setSubunitPreference(subunitPreference);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.SUBUNIT_PREFERENCE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Subunit preference set to ${subunitPreference}`
        );
    };
}
