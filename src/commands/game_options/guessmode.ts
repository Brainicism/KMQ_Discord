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
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
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
        description: i18n.translate(
            guildID,
            "command.guessmode.help.description"
        ),
        usage: "/guessmode set\nguessmode:[song | artist | both]\n\n/guessmode reset",
        examples: [
            {
                example: "`/guessmode set guessmode:song`",
                explanation: i18n.translate(
                    guildID,
                    "command.guessmode.help.example.song"
                ),
            },
            {
                example: "`/guessmode set guessmode:artist`",
                explanation: i18n.translate(
                    guildID,
                    "command.guessmode.help.example.artist"
                ),
            },
            {
                example: "`/guessmode set guessmode:both`",
                explanation: i18n.translate(
                    guildID,
                    "command.guessmode.help.example.both"
                ),
            },
            {
                example: "`/guessmode reset`",
                explanation: i18n.translate(
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
                        "command.guessmode.help.description"
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.guessmode.help.description"
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "guessmode",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.guessmode.interaction.guessMode"
                            ),
                            description_localizations: {
                                [LocaleType.KO]: i18n.translate(
                                    LocaleType.KO,
                                    "command.guessmode.interaction.guessMode"
                                ),
                            },
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
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "guess mode" }
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "misc.interaction.resetOption",
                            { optionName: "guess mode" }
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let guessModeType: GuessModeType | null;

        if (parsedMessage.components.length === 0) {
            guessModeType = null;
        } else {
            guessModeType =
                parsedMessage.components[0].toLowerCase() as GuessModeType;
        }

        await GuessModeCommand.updateOption(
            MessageContext.fromMessage(message),
            guessModeType,
            undefined
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        guessModeType: GuessModeType | null,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = guessModeType == null;

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
            false,
            undefined,
            undefined,
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

        let guessModeValue: GuessModeType | null;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            guessModeValue = null;
        } else if (action === OptionAction.SET) {
            guessModeValue = interactionOptions["guessmode"] as GuessModeType;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            guessModeValue = null;
        }

        await GuessModeCommand.updateOption(
            messageContext,
            guessModeValue,
            interaction
        );
    }
}
