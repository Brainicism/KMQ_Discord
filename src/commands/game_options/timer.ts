import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionOptionValueInteger,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
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
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.timer.help.description"
        ),
        usage: `,timer [${LocalizationManager.localizer.translate(
            guildID,
            "command.timer.help.usage.seconds"
        )}]`,
        examples: [
            {
                example: "`,timer 15`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.timer.help.example.set",
                    { timer: String(15) }
                ),
            },
            {
                example: "`,timer`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.timer.help.example.reset"
                ),
            },
        ],
        priority: 110,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "timer",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.timer.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "timer",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.timer.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
                    required: false,
                    min_value: TIMER_MIN_VALUE,
                    max_value: TIMER_MAX_VALUE,
                } as any,
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
            timer
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        timer: number,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = timer === null;
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
        const timer = getInteractionOptionValueInteger(
            interaction.data.options,
            "timer"
        );

        await GuessTimeoutCommand.updateOption(
            messageContext,
            timer,
            interaction
        );
    }
}
