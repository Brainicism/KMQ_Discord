import { DEFAULT_SEEK, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
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
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import SeekType from "../../enums/option_types/seek_type";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("seek");

export default class SeekCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
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
        usage: "/seek set\nseek:[beginning | middle | random]\n\n/seek reset",
        examples: [
            {
                example: "`/seek set seek:random`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.seek.help.example.random"
                ),
            },
            {
                example: "`/seek set seek:middle`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.seek.help.example.middle"
                ),
            },
            {
                example: "`/seek set seek:beginning`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.seek.help.example.beginning"
                ),
            },
            {
                example: "`/seek reset`",
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

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "seek",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.seek.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.seek.help.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "seek",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.seek.interaction.seek"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(SeekType).map(
                                (seekType) => ({
                                    name: seekType,
                                    value: seekType,
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
                        { optionName: "seek" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let seekType: SeekType;

        if (parsedMessage.components.length === 0) {
            seekType = null;
        } else {
            seekType = parsedMessage.components[0] as SeekType;
        }

        await SeekCommand.updateOption(
            MessageContext.fromMessage(message),
            seekType,
            null,
            seekType == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        seekType: SeekType,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (reset) {
            await guildPreference.reset(GameOption.SEEK_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Seek type reset.`
            );
        } else {
            await guildPreference.setSeekType(seekType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Seek type set to ${seekType}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.SEEK_TYPE, reset }],
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

        let seekValue: SeekType;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            seekValue = null;
        } else if (action === OptionAction.SET) {
            seekValue = interactionOptions["seek"] as SeekType;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            seekValue = null;
        }

        await SeekCommand.updateOption(
            messageContext,
            seekValue,
            interaction,
            seekValue == null
        );
    }
}
