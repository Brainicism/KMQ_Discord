import { DEFAULT_MULTIGUESS_TYPE } from "../../constants";
import { GameOption } from "../../enums/game_option_name";
import { IPCLogger } from "../../logger";
import { MultiGuessType } from "../../enums/option_types/multiguess_type";
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

const logger = new IPCLogger("multiguess");
export default class MultiGuessCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "multiguess_type",
                type: "enum" as const,
                enums: Object.values(MultiGuessType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "multiguess",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.multiguess.help.description",
            { on: `\`${MultiGuessType.ON}\`` }
        ),
        usage: ",multiguess [on | off]",
        examples: [
            {
                example: "`,multiguess on`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.on"
                ),
            },
            {
                example: "`,multiguess off`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.off"
                ),
            },
            {
                example: "`,multiguess`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.multiguess.help.example.reset",
                    { defaultMultiguess: `\`${DEFAULT_MULTIGUESS_TYPE}\`` }
                ),
            },
        ],
        priority: 150,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.MULTIGUESS);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
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
            Session.getSession(message.guildID),
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
