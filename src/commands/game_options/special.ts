import type BaseCommand from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference, isUserPremium } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import type GuildPreference from "../../structures/guild_preference";
import { GameOption } from "../../enums/game_option_name";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { SpecialType } from "../../enums/option_types/special_type";
import LocalizationManager from "../../helpers/localization_manager";
import Session from "../../structures/session";

const logger = new IPCLogger("special");

export default class SpecialCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
        { checkFn: CommandPrechecks.premiumOrDebugServerPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "specialType",
                type: "enum" as const,
                enums: Object.values(SpecialType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "special",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.special.help.description"
        ),
        usage: ",special [reverse | slow | fast | faster | lowpitch | highpitch | nightcore]",
        examples: [
            {
                example: "`,special reverse`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.reverse"
                ),
            },
            {
                example: "`,special slow`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.slow"
                ),
            },
            {
                example: "`,special fast`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.fast"
                ),
            },
            {
                example: "`,special faster`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.faster"
                ),
            },
            {
                example: "`,special lowpitch`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.lowPitch"
                ),
            },
            {
                example: "`,special highpitch`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.highPitch"
                ),
            },
            {
                example: "`,special nightcore`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.nightcore"
                ),
            },
            {
                example: "`,special`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.special.help.example.reset"
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SPECIAL_TYPE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.SPECIAL_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Special reset.`);
            return;
        }

        if (
            process.env.DEBUG_SERVER_ID !== message.guildID &&
            !(await isUserPremium(message.author.id))
        ) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Non-premium user attempted to use premium special option`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.premium.option.description_kmq_server"
                ),
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.premium.option.title"
                ),
            });
            return;
        }

        const specialType = parsedMessage.components[0] as SpecialType;
        await guildPreference.setSpecialType(specialType);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.SPECIAL_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Special type set to ${specialType}`
        );
    };

    resetPremium = async (guildPreference: GuildPreference): Promise<void> => {
        if (guildPreference.guildID !== process.env.DEBUG_SERVER_ID) {
            await guildPreference.reset(GameOption.SPECIAL_TYPE);
        }
    };

    isUsingPremiumOption = (guildPreference: GuildPreference): boolean => {
        return (
            guildPreference.guildID !== process.env.DEBUG_SERVER_ID &&
            guildPreference.gameOptions.specialType !== null
        );
    };
}
