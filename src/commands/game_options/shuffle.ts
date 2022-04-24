import type BaseCommand from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { isUserPremium } from "../../helpers/game_utils";
import {
    sendOptionsMessage,
    getDebugLogHeader,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import { GameOption } from "../../enums/game_option_name";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import GuildPreference from "../../structures/guild_preference";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { ShuffleType } from "../../enums/option_types/shuffle_type";
import { DEFAULT_SHUFFLE } from "../../constants";
import LocalizationManager from "../../helpers/localization_manager";
import Session from "../../structures/session";

const logger = new IPCLogger("shuffle");

const PREMIUM_SHUFFLE_TYPES = [
    ShuffleType.WEIGHTED_EASY,
    ShuffleType.WEIGHTED_HARD,
];

export default class ShuffleCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "shuffleType",
                type: "enum" as const,
                enums: Object.values(ShuffleType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "shuffle",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.shuffle.help.description",
            {
                random: `\`${ShuffleType.RANDOM}\``,
            }
        ),
        usage: ",shuffle [random | popularity]",
        examples: [
            {
                example: "`,shuffle random`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.random"
                ),
            },
            {
                example: "`,shuffle popularity`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.popularity"
                ),
            },
            {
                example: "`,shuffle`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.reset",
                    { defaultShuffle: `\`${DEFAULT_SHUFFLE}\`` }
                ),
            },
        ],
        priority: 110,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SHUFFLE_TYPE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.SHUFFLE_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Shuffle type reset.`);
            return;
        }

        const shuffleType =
            parsedMessage.components[0].toLowerCase() as ShuffleType;

        if (PREMIUM_SHUFFLE_TYPES.includes(shuffleType)) {
            if (!(await isUserPremium(message.author.id))) {
                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Non-premium user attempted to use shuffle option = ${shuffleType}`
                );

                sendErrorMessage(MessageContext.fromMessage(message), {
                    description: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.option.description"
                    ),
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.option.title"
                    ),
                });
                return;
            }
        }

        await guildPreference.setShuffleType(shuffleType);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.SHUFFLE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Shuffle set to ${shuffleType}`
        );
    };

    resetPremium = async (guildPreference: GuildPreference): Promise<void> => {
        await guildPreference.reset(GameOption.SHUFFLE_TYPE);
    };

    isUsingPremiumOption = (guildPreference: GuildPreference): boolean => {
        return PREMIUM_SHUFFLE_TYPES.includes(
            guildPreference.gameOptions.shuffleType
        );
    };
}
