import * as uuid from "uuid";
import {
    GameOptionInternalToGameOption,
    KmqImages,
    MAX_AUTOCOMPLETE_FIELDS,
} from "../../constants";
import { IPCLogger } from "../../logger";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendInfoMessage,
    sendOptionsMessage,
    tryAutocompleteInteractionAcknowledge,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameOption from "../../enums/game_option_name";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "preset";
const logger = new IPCLogger(COMMAND_NAME);
const PRESET_NAME_MAX_LENGTH = 25;
const MAX_NUM_PRESETS = 20;

enum PresetAction {
    LIST = "list",
    SAVE = "save",
    LOAD = "load",
    DELETE = "delete",
    REPLACE = "replace",
    EXPORT = "export",
    IMPORT = "import",
}

export default class PresetCommand implements BaseCommand {
    aliases = ["presets"];

    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(PresetAction),
            },
        ],
    };

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.preset.help.description"),
        examples: [
            {
                example: clickableSlashCommand(COMMAND_NAME, PresetAction.LIST),
                explanation: i18n.translate(
                    guildID,
                    "command.preset.help.example.list",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    PresetAction.SAVE,
                )} preset_name:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetName",
                )}]`,
                explanation: i18n.translate(
                    guildID,
                    "command.preset.help.example.save",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    PresetAction.LOAD,
                )} preset_name:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetName",
                )}]\n/preset load preset_identifier:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetIdentifier",
                )}]`,
                explanation: i18n.translate(
                    guildID,
                    "command.preset.help.example.load",
                    { exampleIdentifier: "`KMQ-XXXXX-...`" },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    PresetAction.REPLACE,
                )} preset_name:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetName",
                )}]`,
                explanation: i18n.translate(
                    guildID,
                    "command.preset.help.example.replace",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    PresetAction.DELETE,
                )} preset_name:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetName",
                )}]`,
                explanation: i18n.translate(
                    guildID,
                    "command.preset.help.example.delete",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    PresetAction.EXPORT,
                )} preset_name:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetName",
                )}]`,
                explanation: i18n.translate(
                    guildID,
                    "command.preset.help.example.export",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    PresetAction.IMPORT,
                )} preset_identifier:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetIdentifier",
                )}] preset_name:[${i18n.translate(
                    guildID,
                    "command.preset.help.usage.presetName",
                )}]`,
                explanation: i18n.translate(
                    guildID,
                    "command.preset.help.example.import",
                ),
            },
        ],
        priority: 200,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: PresetAction.LIST,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.preset.help.example.list",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.preset.help.example.list",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                },
                {
                    name: PresetAction.SAVE,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.preset.help.example.save",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.preset.help.example.save",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "preset_name",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.preset.interaction.save.presetName",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.preset.interaction.save.presetName",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                        },
                    ],
                },
                {
                    name: PresetAction.LOAD,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.preset.help.example.load",
                        { exampleIdentifier: "KMQ-XXXXX-..." },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.preset.help.example.load",
                                    { exampleIdentifier: "KMQ-XXXXX-..." },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "preset_name",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.preset.interaction.load.presetName",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.preset.interaction.load.presetName",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                    ],
                },
                {
                    name: PresetAction.DELETE,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.preset.help.example.delete",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.preset.help.example.delete",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "preset_name",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.preset.interaction.delete.presetName",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.preset.interaction.delete.presetName",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                    ],
                },
                {
                    name: PresetAction.REPLACE,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.preset.help.example.replace",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.preset.help.example.replace",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "preset_name",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.preset.interaction.replace.presetName",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.preset.interaction.replace.presetName",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                    ],
                },
                {
                    name: PresetAction.EXPORT,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.preset.help.example.export",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.preset.help.example.export",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "preset_name",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.preset.interaction.export.presetName",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.preset.interaction.export.presetName",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            autocomplete: true,
                        },
                    ],
                },
                {
                    name: PresetAction.IMPORT,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.preset.help.example.import",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.preset.help.example.import",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "exported_preset",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.preset.interaction.import.exportedPresetID",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.preset.interaction.import.exportedPresetID",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                        },
                        {
                            name: "new_preset_name",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.preset.interaction.import.presetName",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.preset.interaction.import.presetName",
                                        ),
                                    }),
                                    {},
                                ),

                            required: true,
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                        },
                    ],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const presetAction = (parsedMessage.components[0] ??
            PresetAction.LIST) as PresetAction;

        const presetName =
            parsedMessage.components[
                presetAction !== PresetAction.IMPORT ? 1 : 2
            ]!;

        const presetUUID =
            presetAction === PresetAction.IMPORT
                ? parsedMessage.components[1]!
                : null;

        await PresetCommand.processPresetAction(
            MessageContext.fromMessage(message),
            presetAction,
            presetName,
            presetUUID,
        );
    };

    static async deletePreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const deleteResult = await guildPreference.deletePreset(presetName);
        if (!deleteResult) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Tried to delete non-existent preset '${presetName}'`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.description",
                        { presetName: `\`${presetName}\`` },
                    ),
                },
                interaction,
            );
            return;
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Preset '${presetName}' successfully deleted.`,
        );

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.preset.deleted.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.preset.deleted.description",
                    { presetName: `\`${presetName}\`` },
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            false,
            undefined,
            [],
            interaction,
        );
    }

    static async loadPreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        let guildID = messageContext.guildID;
        if (presetName.startsWith("KMQ-")) {
            // User is loading a preset via UUID
            const presetUUID = presetName;
            const existingPresetID = await dbContext.kmq
                .selectFrom("game_option_presets")
                .select(["guild_id", "preset_name"])
                .where("option_name", "=", "uuid")
                .where("option_value", "=", JSON.stringify(presetUUID))
                .executeTakeFirst();

            if (!existingPresetID) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Tried to load non-existent preset identifier \`${presetUUID}\`.`,
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.preset.failure.noSuchPreset.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.preset.failure.noSuchPreset.identifier.description",
                            { presetUUID: `\`${presetUUID}\`` },
                        ),
                    },
                    interaction,
                );
                return;
            }

            guildID = existingPresetID["guild_id"];
            presetName = existingPresetID["preset_name"];
        }

        const loadResult = await guildPreference.loadPreset(
            presetName,
            guildID,
        );

        if (loadResult[0]) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Preset '${presetName}' successfully loaded`,
            );

            await sendOptionsMessage(
                Session.getSession(guildID),
                messageContext,
                guildPreference,
                loadResult[1].map((x) => ({
                    option: GameOptionInternalToGameOption[x] as GameOption,
                    reset: false,
                })),
                true,
                false,
                undefined,
                interaction,
            );
        } else {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Tried to load non-existent preset '${presetName}'`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.description",
                        { presetName: `\`${presetName}\`` },
                    ),
                },
                interaction,
            );
        }
    }

    static async savePreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        if (
            !(await PresetCommand.canSavePreset(
                presetName,
                guildPreference,
                messageContext,
                interaction,
            ))
        ) {
            return;
        }

        const saveResult = await guildPreference.savePreset(presetName, null);
        if (saveResult) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Preset '${presetName}' successfully saved`,
            );

            await sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.saved.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.savedOrReplaced.description",
                        {
                            presetLoad: `${clickableSlashCommand(
                                COMMAND_NAME,
                                PresetAction.LOAD,
                            )} preset_name:${presetName}`,
                        },
                    ),
                    thumbnailUrl: KmqImages.HAPPY,
                },
                false,
                undefined,
                [],
                interaction,
            );
        } else {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Preset '${presetName}' already exists`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.alreadyExists.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.alreadyExists.description",
                        {
                            presetNameFormatted: `\`${presetName}\``,
                            presetDelete: "/preset delete",
                            presetName,
                        },
                    ),
                    thumbnailUrl: KmqImages.DEAD,
                },
                interaction,
            );
        }
    }

    static async replacePreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const oldUUID = await guildPreference.deletePreset(presetName);
        if (!oldUUID) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Preset '${presetName}' replace, preset did not exist`,
            );
        }

        if (
            !(await PresetCommand.isValidPresetName(
                presetName,
                messageContext,
                interaction,
            ))
        ) {
            return;
        }

        await guildPreference.savePreset(presetName, oldUUID);
        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Preset '${presetName}' successfully replaced`,
        );

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.preset.replaced.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.preset.savedOrReplaced.description",
                    {
                        presetLoad: `${clickableSlashCommand(
                            COMMAND_NAME,
                            PresetAction.LOAD,
                        )} preset_name:${presetName}`,
                    },
                ),
                thumbnailUrl: KmqImages.HAPPY,
            },
            false,
            undefined,
            [],
            interaction,
        );
    }

    static async exportPreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const presetUUID = await guildPreference.getPresetUUID(presetName);
        if (!presetUUID) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Preset export failed; '${presetName}' does not exist`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.description",
                        { presetName: `\`${presetName}\`` },
                    ),
                    thumbnailUrl: KmqImages.DEAD,
                },
                interaction,
            );
            return;
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Preset '${presetName}' successfully exported as ${presetUUID}`,
        );

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.preset.exported.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.preset.exported.description",
                    {
                        presetName: `\`${presetName}\``,
                        presetImport: clickableSlashCommand(
                            COMMAND_NAME,
                            PresetAction.IMPORT,
                        ),
                        presetUUID,
                        presetLoad: clickableSlashCommand(
                            COMMAND_NAME,
                            PresetAction.LOAD,
                        ),
                    },
                ),
                thumbnailUrl: KmqImages.THUMBS_UP,
            },
            false,
            undefined,
            [],
            interaction,
        );
    }

    static async importPreset(
        presetUUID: string,
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        if ((await guildPreference.listPresets()).includes(presetName)) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Preset import failed; '${presetName}' already exists`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.alreadyExists.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.alreadyExists.description",
                        {
                            presetNameFormatted: `\`${presetName}\``,
                            presetDelete: clickableSlashCommand(
                                COMMAND_NAME,
                                PresetAction.DELETE,
                            ),
                            presetName,
                        },
                    ),
                    thumbnailUrl: KmqImages.DEAD,
                },
                interaction,
            );
            return;
        }

        const existingPresetID = await dbContext.kmq
            .selectFrom("game_option_presets")
            .select(["guild_id", "preset_name"])
            .where("option_name", "=", "uuid")
            .where("option_value", "=", JSON.stringify(presetUUID))
            .executeTakeFirst();

        if (!existingPresetID) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Tried to load non-existent preset identifier \`${presetUUID}\`.`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.identifier.description",
                        { presetUUID: `\`${presetUUID}\`` },
                    ),
                },
                interaction,
            );
            return;
        }

        const presetOptionsDb = await dbContext.kmq
            .selectFrom("game_option_presets")
            .select(["option_name", "option_value"])
            .where("guild_id", "=", existingPresetID["guild_id"])
            .where("preset_name", "=", existingPresetID["preset_name"])
            .execute();

        await dbContext.kmq.transaction().execute(async (trx) => {
            const presetOptionObjects = presetOptionsDb
                .filter((option) => option["option_name"] !== "uuid")
                .map((option) => ({
                    guild_id: messageContext.guildID,
                    preset_name: presetName,
                    option_name: option["option_name"],
                    option_value: option["option_value"],
                }));

            presetOptionObjects.push({
                guild_id: messageContext.guildID,
                preset_name: presetName,
                option_name: "uuid",
                option_value: JSON.stringify(`KMQ-${uuid.v4()}`),
            });

            await Promise.all(
                presetOptionObjects.map((x) =>
                    trx
                        .insertInto("game_option_presets")
                        .values(x)
                        .onDuplicateKeyUpdate(x)
                        .execute(),
                ),
            );
        });

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Preset '${presetName}' imported`,
        );

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.preset.imported.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.preset.imported.description",
                    {
                        presetLoad: clickableSlashCommand(
                            COMMAND_NAME,
                            PresetAction.LOAD,
                        ),
                        presetName,
                    },
                ),
                thumbnailUrl: KmqImages.THUMBS_UP,
            },
            false,
            undefined,
            [],
            interaction,
        );
    }

    static async listPresets(
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const presets = await guildPreference.listPresets();
        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.preset.list.title",
                ),
                description:
                    presets.length > 0
                        ? presets.join("\n")
                        : i18n.translate(
                              messageContext.guildID,
                              "command.preset.list.failure.noPresets.description",
                              {
                                  presetHelp: `${clickableSlashCommand(
                                      "help",
                                  )} action:${COMMAND_NAME}`,
                              },
                          ),
                footerText:
                    presets.length > 0
                        ? i18n.translate(
                              messageContext.guildID,
                              "command.preset.list.loadInstructions.footer",
                              {
                                  presetLoad: "/preset load",
                              },
                          )
                        : undefined,
            },
            false,
            undefined,
            [],
            interaction,
        );

        logger.info(
            `${getDebugLogHeader(messageContext)} | Listed all presets`,
        );
    }

    static async processPresetAction(
        messageContext: MessageContext,
        presetAction: PresetAction,
        presetName: string,
        presetUUID: string | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (presetAction === PresetAction.LIST) {
            await PresetCommand.listPresets(
                guildPreference,
                messageContext,
                interaction,
            );

            return;
        }

        const missingPresetMessage = async (): Promise<void> => {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.missingName.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.missingName.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction,
            );

            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Preset name not specified`,
            );
        };

        if (presetAction !== PresetAction.IMPORT && !presetName) {
            await missingPresetMessage();
            return;
        }

        switch (presetAction) {
            case PresetAction.SAVE:
                await PresetCommand.savePreset(
                    presetName,
                    guildPreference,
                    messageContext,
                    interaction,
                );
                break;
            case PresetAction.LOAD:
                await PresetCommand.loadPreset(
                    presetName,
                    guildPreference,
                    messageContext,
                    interaction,
                );
                break;
            case PresetAction.DELETE:
                await PresetCommand.deletePreset(
                    presetName,
                    guildPreference,
                    messageContext,
                    interaction,
                );
                break;
            case PresetAction.REPLACE:
                await PresetCommand.replacePreset(
                    presetName,
                    guildPreference,
                    messageContext,
                    interaction,
                );
                break;
            case PresetAction.EXPORT:
                await PresetCommand.exportPreset(
                    presetName,
                    guildPreference,
                    messageContext,
                    interaction,
                );
                break;
            case PresetAction.IMPORT: {
                if (!presetUUID) {
                    await sendErrorMessage(
                        messageContext,
                        {
                            title: i18n.translate(
                                messageContext.guildID,
                                "command.preset.failure.missingIdentifier.title",
                            ),
                            description: i18n.translate(
                                messageContext.guildID,
                                "command.preset.failure.missingIdentifier.description",
                                {
                                    presetExport: "/preset export",
                                },
                            ),
                            thumbnailUrl: KmqImages.NOT_IMPRESSED,
                        },
                        interaction,
                    );

                    logger.warn(
                        `${getDebugLogHeader(
                            messageContext,
                        )} | Preset UUID not specified`,
                    );
                    break;
                }

                if (!presetName) {
                    await missingPresetMessage();
                    break;
                }

                await PresetCommand.importPreset(
                    presetUUID,
                    presetName,
                    guildPreference,
                    messageContext,
                    interaction,
                );
                break;
            }

            default:
        }
    }

    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionOptions, interactionName } =
            getInteractionValue(interaction);

        const presetAction = interactionName as PresetAction;

        let presetName: string;
        let presetUUID: string | null = null;

        if (presetAction === PresetAction.IMPORT) {
            presetName = interactionOptions["new_preset_name"];

            presetUUID = interactionOptions["exported_preset"];
        } else {
            presetName = interactionOptions["preset_name"];
        }

        await PresetCommand.processPresetAction(
            messageContext,
            presetAction,
            presetName,
            presetUUID,
            interaction,
        );
    }

    /**
     * Handles showing suggested presets as the user types
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            interaction.guildID as string,
        );

        const presets = await guildPreference.listPresets();
        const lowercaseUserInput = (
            (
                interaction.data
                    .options[0] as Eris.InteractionDataOptionsSubCommand
            ).options!.filter(
                (x) => x["focused"],
            )[0] as Eris.InteractionDataOptionsString
        ).value.toLowerCase();

        await tryAutocompleteInteractionAcknowledge(
            interaction,
            presets
                .filter((x) =>
                    lowercaseUserInput.length === 0
                        ? true
                        : x.toLowerCase().startsWith(lowercaseUserInput),
                )
                .map((x) => ({ name: x, value: x }))
                .slice(0, MAX_AUTOCOMPLETE_FIELDS),
        );
    }

    static async isValidPresetName(
        presetName: string,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<boolean> {
        if (presetName.length > PRESET_NAME_MAX_LENGTH) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Can't add preset, character limit reached.`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.lengthyName.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.lengthyName.description",
                        { presetNameMaxLength: String(PRESET_NAME_MAX_LENGTH) },
                    ),
                },
                interaction,
            );
            return false;
        }

        if (presetName.startsWith("KMQ-")) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Can't add preset, illegal prefix.`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.illegalPrefix.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.illegalPrefix.description",
                        { importPrefix: "`KMQ-`" },
                    ),
                },
                interaction,
            );
            return false;
        }

        return true;
    }

    static async canSavePreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<boolean> {
        const presets = await guildPreference.listPresets();
        if (presets.length >= MAX_NUM_PRESETS) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Can't add preset, maximum reached.`,
            );

            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.tooMany.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.preset.failure.tooMany.description",
                        { maxNumPresets: String(MAX_NUM_PRESETS) },
                    ),
                },
                interaction,
            );
            return false;
        }

        return PresetCommand.isValidPresetName(
            presetName,
            messageContext,
            interaction,
        );
    }
}
