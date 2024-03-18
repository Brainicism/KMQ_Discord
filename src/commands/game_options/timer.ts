import { IPCLogger } from "../../logger";
import { OptionAction } from "../../constants";
import { clickableSlashCommand } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "timer";
const logger = new IPCLogger("guessTimeout");

// eslint-disable-next-line import/no-unused-modules
export default class GuessTimeoutCommand implements BaseCommand {
    static TIMER_MIN_VALUE = 2;
    static TIMER_MAX_VALUE = 180;
    aliases = ["time", "timeout", "t"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.timerHiddenPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "timer",
                type: "number" as const,
                minValue: GuessTimeoutCommand.TIMER_MIN_VALUE,
                maxValue: GuessTimeoutCommand.TIMER_MAX_VALUE,
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.timer.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} timer:15`,
                explanation: i18n.translate(
                    guildID,
                    "command.timer.help.example.set",
                    { timer: String(15) },
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.timer.help.example.reset",
                ),
            },
        ],
        priority: 110,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.timer.help.interaction.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.timer.help.interaction.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "timer",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.timer.help.interaction.timer",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.timer.help.interaction.timer",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            required: true,
                            min_value: GuessTimeoutCommand.TIMER_MIN_VALUE,
                            max_value: GuessTimeoutCommand.TIMER_MAX_VALUE,
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "timer" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "timer" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let timer: number | null;
        if (parsedMessage.components.length === 0) {
            timer = null;
        } else {
            timer = parseInt(parsedMessage.components[0], 10);
        }

        await GuessTimeoutCommand.updateOption(
            MessageContext.fromMessage(message),
            timer,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        timer: number | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const session = Session.getSession(messageContext.guildID);

        const reset = timer == null;
        if (reset) {
            await guildPreference.reset(GameOption.TIMER);
            if (session) {
                session.stopGuessTimeout();
            }

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Guess timeout disabled.`,
            );
        } else {
            await guildPreference.setGuessTimeout(timer);

            logger.info(
                `${getDebugLogHeader(messageContext)} | Guess timeout set to ${
                    guildPreference.gameOptions.guessTimeout
                }`,
            );
        }

        if (session && session.round && session.connection?.playing) {
            const round = session.round;
            // Timer can start mid-song, starting when the user enters the command
            session.stopGuessTimeout();
            session.startGuessTimeout(messageContext);
            round.timerStartedAt = Date.now();
            round.interactionMessageNeedsUpdate = true;
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.TIMER, reset }],
            false,
            undefined,
            undefined,
            interaction,
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        let timerValue: number | null;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            timerValue = null;
        } else if (action === OptionAction.SET) {
            timerValue = interactionOptions["timer"] as number;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            timerValue = null;
        }

        await GuessTimeoutCommand.updateOption(
            messageContext,
            timerValue,
            interaction,
        );
    }
}
