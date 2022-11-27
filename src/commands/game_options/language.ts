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
import LanguageType from "../../enums/option_types/language_type";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("language");

export default class LanguageCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "language",
                type: "enum" as const,
                enums: Object.values(LanguageType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "language",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.language.help.description"
        ),
        usage: ",language set\nlanguage:[korean | all]\n\n,language reset",
        examples: [
            {
                example: "`,language set language:korean`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.language.help.example.korean"
                ),
            },
            {
                example: "`,language set language:all`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.language.help.example.all"
                ),
            },
            {
                example: "`,language reset`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.language.help.example.reset",
                    { defaultLanguage: `\`${LanguageType.ALL}\`` }
                ),
            },
        ],
        priority: 150,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "language",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.language.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.language.help.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "language",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.language.interaction.language"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(LanguageType).map(
                                (languageType) => ({
                                    name: languageType,
                                    value: languageType,
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
                        { optionName: "language" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let languageType: LanguageType;
        if (parsedMessage.components.length === 0) {
            languageType = null;
        } else {
            languageType = parsedMessage.components[0] as LanguageType;
        }

        await LanguageCommand.updateOption(
            MessageContext.fromMessage(message),
            languageType,
            null,
            languageType == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        languageType: LanguageType,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (reset) {
            await guildPreference.reset(GameOption.LANGUAGE_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Language type reset.`
            );
        } else {
            await guildPreference.setLanguageType(languageType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Language type set to ${languageType}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.LANGUAGE_TYPE, reset }],
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

        let languageValue: LanguageType;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            languageValue = null;
        } else if (action === OptionAction.SET) {
            languageValue = interactionOptions["language"] as LanguageType;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            languageValue = null;
        }

        await LanguageCommand.updateOption(
            messageContext,
            languageValue,
            interaction,
            languageValue == null
        );
    }
}
