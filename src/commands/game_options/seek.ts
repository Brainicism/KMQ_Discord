import { DEFAULT_SEEK, OptionAction } from "../../constants.js";
import { IPCLogger } from "../../logger.js";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import * as Eris from "eris";
import GameOption from "../../enums/game_option_name.js";
import GuildPreference from "../../structures/guild_preference.js";
import LocaleType from "../../enums/locale_type.js";
import MessageContext from "../../structures/message_context.js";
import SeekType from "../../enums/option_types/seek_type.js";
import Session from "../../structures/session.js";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "seek";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class SeekCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.notClipModePrecheck },
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
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.seek.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} seek:random`,
                explanation: i18n.translate(
                    guildID,
                    "command.seek.help.example.random",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} seek:middle`,
                explanation: i18n.translate(
                    guildID,
                    "command.seek.help.example.middle",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} seek:beginning`,
                explanation: i18n.translate(
                    guildID,
                    "command.seek.help.example.beginning",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.seek.help.example.reset",
                    {
                        defaultSeek: DEFAULT_SEEK,
                    },
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
                        "command.seek.help.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.seek.help.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "seek",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.seek.interaction.seek",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.seek.interaction.seek",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(SeekType).map(
                                (seekType) => ({
                                    name: seekType,
                                    value: seekType,
                                }),
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "seek" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "seek" },
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
        let seekType: SeekType | null;

        if (parsedMessage.components.length === 0) {
            seekType = null;
        } else {
            seekType = parsedMessage.components[0] as SeekType;
        }

        await SeekCommand.updateOption(
            MessageContext.fromMessage(message),
            seekType,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        seekType: SeekType | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = seekType == null;
        if (reset) {
            await guildPreference.reset(GameOption.SEEK_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Seek type reset.`,
            );
        } else {
            await guildPreference.setSeekType(seekType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Seek type set to ${seekType}`,
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.SEEK_TYPE, reset }],
            false,
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

        let seekValue: SeekType | null;

        const action = interactionName as OptionAction;
        switch (action) {
            case OptionAction.RESET:
                seekValue = null;
                break;
            case OptionAction.SET:
                seekValue = interactionOptions["seek"] as SeekType;
                break;
            default:
                logger.error(`Unexpected interaction name: ${interactionName}`);
                seekValue = null;
                break;
        }

        await SeekCommand.updateOption(messageContext, seekValue, interaction);
    }
}
