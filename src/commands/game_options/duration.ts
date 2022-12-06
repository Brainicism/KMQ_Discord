import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
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

const logger = new IPCLogger("duration");

enum DurationAction {
    ADD = "add",
    REMOVE = "remove",
}

enum DurationActionInternal {
    ADD = "add",
    REMOVE = "remove",
    RESET = "reset",
    SET = "set",
}

const DURATION_DELTA_MIN = 2;
const DURATION_DELTA_MAX = 600;

export default class DurationCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "duration",
                type: "number" as const,
                minValue: DURATION_DELTA_MIN,
                maxValue: DURATION_DELTA_MAX,
            },
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(DurationAction),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "duration",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.duration.help.description"
        ),
        usage: `/duration set\nduration:[${LocalizationManager.localizer.translate(
            guildID,
            "command.duration.help.usage.minutes"
        )}]\n\n/duration add\nduration:[${LocalizationManager.localizer.translate(
            guildID,
            "command.duration.help.usage.minutes"
        )}]\n\n/duration remove\nduration:[${LocalizationManager.localizer.translate(
            guildID,
            "command.duration.help.usage.minutes"
        )}]\n\n/duration reset`,
        examples: [
            {
                example: "`,duration set duration:15`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.set",
                    {
                        duration: String(15),
                    }
                ),
            },
            {
                example: "`,duration add duration:5`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.increment",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration remove duration:5`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.decrement",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration reset`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.reset"
                ),
            },
        ],
        priority: 110,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "duration",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.duration.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: DurationActionInternal.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.duration.help.example.set",
                        { duration: "[duration]" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.duration.interaction.durationSet"
                                ),
                            required: true,
                            min_value: DURATION_DELTA_MIN,
                            max_value: DURATION_DELTA_MAX,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                        } as any,
                    ],
                },
                {
                    name: DurationActionInternal.ADD,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.duration.help.example.increment",
                        { duration: "[duration]" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.duration.interaction.durationAdd"
                                ),
                            required: true,
                            min_value: DURATION_DELTA_MIN,
                            max_value: DURATION_DELTA_MAX,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                        },
                    ],
                },
                {
                    name: DurationActionInternal.REMOVE,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.duration.help.example.decrement",
                        { duration: "[duration]" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.duration.interaction.durationRemove"
                                ),
                            required: true,
                            min_value: DURATION_DELTA_MIN,
                            max_value: DURATION_DELTA_MAX,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .INTEGER,
                        },
                    ],
                },
                {
                    name: DurationActionInternal.RESET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "duration" }
                    ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let durationActionInternal: DurationActionInternal = null;
        let durationValue: number = null;

        if (parsedMessage.components.length === 0) {
            durationActionInternal = DurationActionInternal.RESET;
        } else {
            durationActionInternal =
                (parsedMessage.components[1] as DurationActionInternal) ??
                DurationActionInternal.SET;
            durationValue = parseInt(parsedMessage.components[0], 10);
        }

        await DurationCommand.updateOption(
            MessageContext.fromMessage(message),
            durationActionInternal,
            durationValue,
            null,
            durationActionInternal === DurationActionInternal.RESET
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        action: DurationActionInternal,
        durationValue?: number,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        let finalDuration: number = null;
        if (reset) {
            await guildPreference.reset(GameOption.DURATION);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Duration disabled.`
            );
        } else {
            const currentDuration = guildPreference.gameOptions.duration;
            if (action === DurationActionInternal.ADD) {
                if (!guildPreference.isDurationSet()) {
                    finalDuration = durationValue;
                } else {
                    finalDuration = currentDuration + durationValue;
                }
            } else if (action === DurationActionInternal.REMOVE) {
                if (!guildPreference.isDurationSet()) {
                    sendErrorMessage(
                        messageContext,
                        {
                            title: LocalizationManager.localizer.translate(
                                messageContext.guildID,
                                "command.duration.failure.removingDuration.title"
                            ),
                            description:
                                LocalizationManager.localizer.translate(
                                    messageContext.guildID,
                                    "command.duration.failure.removingDuration.notSet.description"
                                ),
                        },
                        interaction
                    );
                    return;
                }

                finalDuration = currentDuration - durationValue;
                if (finalDuration < 2) {
                    sendErrorMessage(
                        messageContext,
                        {
                            title: LocalizationManager.localizer.translate(
                                messageContext.guildID,
                                "command.duration.failure.removingDuration.title"
                            ),
                            description:
                                LocalizationManager.localizer.translate(
                                    messageContext.guildID,
                                    "command.duration.failure.removingDuration.tooShort.description"
                                ),
                        },
                        interaction
                    );
                    return;
                }
            } else if (action === DurationActionInternal.SET) {
                finalDuration = durationValue;
            }

            logger.info(
                `${getDebugLogHeader(messageContext)} | Duration set to ${
                    guildPreference.gameOptions.duration
                }`
            );
        }

        await guildPreference.setDuration(finalDuration);
        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.DURATION, reset: false }],
            null,
            null,
            null,
            interaction
        );
    }

    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        const action = interactionName as DurationActionInternal;
        let durationValue: number;

        if (action === DurationActionInternal.RESET) {
            durationValue = null;
        } else if (
            [
                DurationActionInternal.ADD,
                DurationActionInternal.REMOVE,
                DurationActionInternal.SET,
            ].includes(action)
        ) {
            durationValue = interactionOptions["duration"];
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            durationValue = null;
        }

        await DurationCommand.updateOption(
            messageContext,
            action,
            durationValue,
            interaction,
            action === DurationActionInternal.RESET
        );
    }
}
