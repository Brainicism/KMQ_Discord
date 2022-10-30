import { DEFAULT_GUESS_MODE, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuessModeType from "../../enums/option_types/guess_mode_type";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("guessmode");

export default class GuessModeCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    aliases = ["mode"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "guessModeType",
                type: "enum" as const,
                enums: Object.values(GuessModeType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "guessmode",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.guessmode.help.description"
        ),
        usage: ",guessmode [song | artist | both]",
        examples: [
            {
                example: "`,guessmode song`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.song"
                ),
            },
            {
                example: "`,guessmode artist`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.artist"
                ),
            },
            {
                example: "`,guessmode both`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.both"
                ),
            },
            {
                example: "`,guessmode`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.reset",
                    {
                        defaultGuessMode: DEFAULT_GUESS_MODE,
                    }
                ),
            },
        ],
        priority: 130,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "guessmode",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.guessmode.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.guessmode.help.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "guessmode",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.guessmode.help.description"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(GuessModeType).map(
                                (guessModeType) => ({
                                    name: guessModeType,
                                    value: guessModeType,
                                })
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "guess mode" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let guessModeType: GuessModeType;

        if (parsedMessage.components.length === 0) {
            guessModeType = null;
        } else {
            guessModeType =
                parsedMessage.components[0].toLowerCase() as GuessModeType;
        }

        await GuessModeCommand.updateOption(
            MessageContext.fromMessage(message),
            guessModeType,
            null,
            guessModeType == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        guessModeType: GuessModeType,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (reset) {
            await guildPreference.reset(GameOption.GUESS_MODE_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Guess mode type reset.`
            );
        } else {
            await guildPreference.setGuessModeType(guessModeType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Guess mode type set to ${guessModeType}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.GUESS_MODE_TYPE, reset }],
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

        let guessModeValue: GuessModeType;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            guessModeValue = null;
        } else if (action === OptionAction.SET) {
            guessModeValue = interactionOptions["guessmode"] as GuessModeType;
        }

        await GuessModeCommand.updateOption(
            messageContext,
            guessModeValue,
            interaction,
            guessModeValue == null
        );
    }
}
