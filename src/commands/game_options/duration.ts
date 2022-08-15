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
    DISABLE = "disable",
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
        usage: `,duration [${LocalizationManager.localizer.translate(
            guildID,
            "command.duration.help.usage.minutes"
        )}]`,
        examples: [
            {
                example: "`,duration 15`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.set",
                    {
                        duration: String(15),
                    }
                ),
            },
            {
                example: "`,duration 5 add`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.increment",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration 5 remove`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.duration.help.example.decrement",
                    {
                        duration: String(5),
                    }
                ),
            },
            {
                example: "`,duration`",
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
                        "command.duration.help.example.set"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.duration.help.example.set"
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
                        "command.duration.help.example.increment"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.duration.help.example.increment"
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
                        "command.duration.help.example.decrement"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "duration",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.duration.help.example.decrement"
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
                    name: DurationActionInternal.DISABLE,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.duration.help.example.reset"
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
            durationActionInternal = DurationActionInternal.DISABLE;
        } else {
            durationActionInternal =
                (parsedMessage.components[1] as DurationActionInternal) ??
                DurationActionInternal.SET;
            durationValue = parseInt(parsedMessage.components[0], 10);
        }

        await DurationCommand.updateOption(
            MessageContext.fromMessage(message),
            durationActionInternal,
            durationValue
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        action: DurationActionInternal,
        durationValue?: number,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        let finalDuration: number = null;
        if (action === DurationActionInternal.DISABLE) {
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

        const durationValue = interactionOptions["duration"];

        await DurationCommand.updateOption(
            messageContext,
            action,
            durationValue,
            interaction
        );
    }
}
