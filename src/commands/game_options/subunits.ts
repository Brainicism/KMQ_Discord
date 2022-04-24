import { DEFAULT_SUBUNIT_PREFERENCE } from "../../constants";
import { GameOption } from "../../enums/game_option_name";
import { IPCLogger } from "../../logger";
import { SubunitsPreference } from "../../enums/option_types/subunit_preference";
import {
    getDebugLogHeader,
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

const logger = new IPCLogger("subunits");

export default class SubunitsCommand implements BaseCommand {
    aliases = ["subunit", "su"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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

    help = (guildID: string): HelpDocumentation => ({
        name: "subunits",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.subunits.help.description",
            { groups: `\`${process.env.BOT_PREFIX}groups\`` }
        ),
        usage: ",subunits [include | exclude]",
        examples: [
            {
                example: "`,subunits include`",
                explanation: LocalizationManager.localizer.translate(
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
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.subunits.help.example.exclude"
                ),
            },
            {
                example: "`,subunits`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.subunits.help.example.reset",
                    { defaultSubunit: `\`${DEFAULT_SUBUNIT_PREFERENCE}\`` }
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SUBUNIT_PREFERENCE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
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
            Session.getSession(message.guildID),
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
