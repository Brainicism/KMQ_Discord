import { IPCLogger } from "../../logger";
import { OptionAction } from "../../constants";
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

const logger = new IPCLogger("guessTimeout");
const TIMER_MIN_VALUE = 2;
const TIMER_MAX_VALUE = 180;
export default class GuessTimeoutCommand implements BaseCommand {
    aliases = ["time", "timeout", "t"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "timer",
                type: "number" as const,
                minValue: TIMER_MIN_VALUE,
                maxValue: TIMER_MAX_VALUE,
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "timer",
        description: i18n.translate(guildID, "command.timer.help.description"),
        usage: `,timer [${i18n.translate(
            guildID,
            "command.timer.help.usage.seconds"
        )}]`,
        examples: [
            {
                example: "`,timer 15`",
                explanation: i18n.translate(
                    guildID,
                    "command.timer.help.example.set",
                    { timer: String(15) }
                ),
            },
            {
                example: "`,timer`",
                explanation: i18n.translate(
                    guildID,
                    "command.timer.help.example.reset"
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
                        "command.timer.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "timer",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.timer.interaction.timer"
                            ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                            required: true,
                            min_value: TIMER_MIN_VALUE,
                            max_value: TIMER_MAX_VALUE,
                        } as any,
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "timer" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let timer: number;
        if (parsedMessage.components.length === 0) {
            timer = null;
        } else {
            timer = parseInt(parsedMessage.components[0], 10);
        }

        await GuessTimeoutCommand.updateOption(
            MessageContext.fromMessage(message),
            timer,
            null,
            timer == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        timer: number,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const session = Session.getSession(messageContext.guildID);

        if (reset) {
            await guildPreference.reset(GameOption.TIMER);
            if (session) {
                session.stopGuessTimeout();
            }

            logger.info(
                `${getDebugLogHeader(messageContext)} | Guess timeout disabled.`
            );
        } else {
            await guildPreference.setGuessTimeout(timer);

            logger.info(
                `${getDebugLogHeader(messageContext)} | Guess timeout set to ${
                    guildPreference.gameOptions.guessTimeout
                }`
            );
        }

        if (session && session.round && session.connection.playing) {
            // Timer can start mid-song, starting when the user enters the command
            session.stopGuessTimeout();
            session.startGuessTimeout(messageContext);
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.TIMER, reset }],
            null,
            null,
            null,
            interaction
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        let timerValue: number;

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
            timerValue == null
        );
    }
}
