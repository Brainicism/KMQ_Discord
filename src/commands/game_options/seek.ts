import type BaseCommand from "../interfaces/base_command";
import {
    sendOptionsMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../enums/game_option_name";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { SeekType } from "../../enums/option_types/seek_type";
import { DEFAULT_SEEK } from "../../constants";
import LocalizationManager from "../../helpers/localization_manager";
import Session from "../../structures/session";
import GuildPreference from "../../structures/guild_preference";

const logger = new IPCLogger("seek");

export default class SeekCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "seekType",
                type: "enum" as const,
                enums: Object.values(SeekType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "seek",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.seek.help.description"
        ),
        usage: ",seek [beginning | middle | random]",
        examples: [
            {
                example: "`,seek random`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.seek.help.example.random"
                ),
            },
            {
                example: "`,seek middle`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.seek.help.example.middle"
                ),
            },
            {
                example: "`,seek beginning`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.seek.help.example.beginning"
                ),
            },
            {
                example: "`,seek`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.seek.help.example.reset",
                    {
                        defaultSeek: DEFAULT_SEEK,
                    }
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
            await guildPreference.reset(GameOption.SEEK_TYPE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.SEEK_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Seek reset.`);
            return;
        }

        const seekType = parsedMessage.components[0] as SeekType;
        await guildPreference.setSeekType(seekType);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.SEEK_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Seek type set to ${seekType}`
        );
    };
}
