import * as uuid from "uuid";

import CommandPrechecks from "../../command_prechecks";
import { KmqImages } from "../../constants";
import dbContext from "../../database_context";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import GuildPreference, {
    GameOptionInternalToGameOption,
} from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("preset");
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
        arguments: [
            {
                enums: Object.values(PresetAction),
                name: "option",
                type: "enum" as const,
            },
        ],
        maxArgCount: 3,
        minArgCount: 0,
    };

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.preset.help.description"
        ),
        examples: [
            {
                example: "`,preset list`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.preset.help.example.list"
                ),
            },
            {
                example: "`,preset save [preset_name]`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.preset.help.example.save"
                ),
            },
            {
                example: "`,preset load [preset_name | preset_identifier]`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.preset.help.example.load",
                    { exampleIdentifier: "`KMQ-XXXXX-...`" }
                ),
            },
            {
                example: "`,preset replace [preset_name]`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.preset.help.example.replace"
                ),
            },
            {
                example: "`,preset delete [preset_name]`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.preset.help.example.delete"
                ),
            },
            {
                example: "`,preset export [preset_name]`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.preset.help.example.export"
                ),
            },
            {
                example: "`,preset import [preset_identifier] [preset_name]`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.preset.help.example.import",
                    { exampleIdentifier: "`KMQ-XXXXX-...`" }
                ),
            },
        ],
        name: "preset",
        priority: 200,
        usage: `,preset [list | save | load | delete | export] {preset_name}\n,preset import [${state.localizer.translate(
            guildID,
            "command.preset.help.usage.presetIdentifier"
        )}] [${state.localizer.translate(
            guildID,
            "command.preset.help.usage.presetName"
        )}]`,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const presetAction =
            (parsedMessage.components[0] as PresetAction) || null;

        const messageContext = MessageContext.fromMessage(message);
        if (!presetAction || presetAction === PresetAction.LIST) {
            PresetCommand.listPresets(guildPreference, messageContext);
            return;
        }

        const missingPresetMessage = (): void => {
            sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    message.guildID,
                    "command.preset.failure.missingName.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
                title: state.localizer.translate(
                    message.guildID,
                    "command.preset.failure.missingName.title"
                ),
            });

            logger.warn(
                `${getDebugLogHeader(message)} | Preset name not specified`
            );
        };

        const presetName =
            parsedMessage.components[
                presetAction !== PresetAction.IMPORT ? 1 : 2
            ];

        if (presetAction !== PresetAction.IMPORT && !presetName) {
            missingPresetMessage();
            return;
        }

        switch (presetAction) {
            case PresetAction.SAVE:
                await PresetCommand.savePreset(
                    presetName,
                    guildPreference,
                    messageContext
                );
                break;
            case PresetAction.LOAD:
                await PresetCommand.loadPreset(
                    presetName,
                    guildPreference,
                    messageContext
                );
                break;
            case PresetAction.DELETE:
                await PresetCommand.deletePreset(
                    presetName,
                    guildPreference,
                    messageContext
                );
                break;
            case PresetAction.REPLACE:
                await PresetCommand.replacePreset(
                    presetName,
                    guildPreference,
                    messageContext
                );
                break;
            case PresetAction.EXPORT:
                await PresetCommand.exportPreset(
                    presetName,
                    guildPreference,
                    messageContext
                );
                break;
            case PresetAction.IMPORT: {
                const presetUUID = parsedMessage.components[1];
                if (!presetUUID) {
                    sendErrorMessage(messageContext, {
                        description: state.localizer.translate(
                            message.guildID,
                            "command.preset.failure.missingIdentifier.description",
                            {
                                presetExport: `${process.env.BOT_PREFIX}preset export`,
                            }
                        ),
                        thumbnailUrl: KmqImages.NOT_IMPRESSED,
                        title: state.localizer.translate(
                            message.guildID,
                            "command.preset.failure.missingIdentifier.title"
                        ),
                    });

                    logger.warn(
                        `${getDebugLogHeader(
                            message
                        )} | Preset UUID not specified`
                    );
                    break;
                }

                if (!presetName) {
                    missingPresetMessage();
                    break;
                }

                await PresetCommand.importPreset(
                    presetUUID,
                    presetName,
                    guildPreference,
                    messageContext
                );
                break;
            }

            default:
        }
    };

    static async deletePreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        const deleteResult = await guildPreference.deletePreset(presetName);
        if (!deleteResult) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Tried to delete non-existent preset '${presetName}'`
            );

            await sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.description",
                    { presetName: `\`${presetName}\`` }
                ),
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.title"
                ),
            });
            return;
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Preset '${presetName}' successfully deleted.`
        );

        await sendInfoMessage(messageContext, {
            description: state.localizer.translate(
                messageContext.guildID,
                "command.preset.deleted.description",
                { presetName: `\`${presetName}\`` }
            ),
            thumbnailUrl: KmqImages.NOT_IMPRESSED,
            title: state.localizer.translate(
                messageContext.guildID,
                "command.preset.deleted.title"
            ),
        });
    }

    static async loadPreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        let guildID = messageContext.guildID;
        if (presetName.startsWith("KMQ-")) {
            // User is loading a preset via UUID
            const presetUUID = presetName;
            const existingPresetID = await dbContext
                .kmq("game_option_presets")
                .select(["guild_id", "preset_name"])
                .where("option_name", "=", "uuid")
                .andWhere("option_value", "=", JSON.stringify(presetUUID))
                .first();

            if (!existingPresetID) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Tried to load non-existent preset identifier \`${presetUUID}\`.`
                );

                await sendErrorMessage(messageContext, {
                    description: state.localizer.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.identifier.description",
                        { presetUUID: `\`${presetUUID}\`` }
                    ),
                    title: state.localizer.translate(
                        messageContext.guildID,
                        "command.preset.failure.noSuchPreset.title"
                    ),
                });
                return;
            }

            guildID = existingPresetID["guild_id"];
            presetName = existingPresetID["preset_name"];
        }

        const loadResult = await guildPreference.loadPreset(
            presetName,
            guildID
        );

        if (loadResult[0]) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Preset '${presetName}' successfully loaded`
            );

            sendOptionsMessage(
                messageContext,
                guildPreference,
                loadResult[1].map((x) => ({
                    option: GameOptionInternalToGameOption[x] as GameOption,
                    reset: false,
                })),
                true
            );
        } else {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Tried to load non-existent preset '${presetName}'`
            );

            await sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.description",
                    { presetName: `\`${presetName}\`` }
                ),
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.title"
                ),
            });
        }
    }

    static async savePreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        const presets = await guildPreference.listPresets();
        if (presets.length >= MAX_NUM_PRESETS) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Can't add present, maximum reached.`
            );

            await sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.tooMany.description",
                    { maxNumPresets: String(MAX_NUM_PRESETS) }
                ),
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.tooMany.title"
                ),
            });
            return;
        }

        if (presetName.length > PRESET_NAME_MAX_LENGTH) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Can't add preset, character limit reached.`
            );

            await sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.lengthyName.description",
                    { presetNameMaxLength: String(PRESET_NAME_MAX_LENGTH) }
                ),
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.lengthyName.title"
                ),
            });
            return;
        }

        if (presetName.startsWith("KMQ-")) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Can't add preset, illegal prefix.`
            );

            await sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.illegalPrefix.description",
                    { importPrefix: "`KMQ-`" }
                ),
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.illegalPrefix.title"
                ),
            });
            return;
        }

        const saveResult = await guildPreference.savePreset(presetName);
        if (saveResult) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Preset '${presetName}' successfully saved`
            );

            await sendInfoMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.savedOrReplaced.description",
                    {
                        presetLoad: `\`${process.env.BOT_PREFIX}preset load ${presetName}\``,
                    }
                ),
                thumbnailUrl: KmqImages.HAPPY,
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.saved.title"
                ),
            });
        } else {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Preset '${presetName}' already exists`
            );

            await sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.alreadyExists.description",
                    {
                        presetDelete: `${process.env.BOT_PREFIX}preset delete`,
                        presetName,
                        presetNameFormatted: `\`${presetName}\``,
                    }
                ),
                thumbnailUrl: KmqImages.DEAD,
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.alreadyExists.title"
                ),
            });
        }
    }

    static async replacePreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        const oldUUID = await guildPreference.deletePreset(presetName);
        if (!oldUUID) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Preset '${presetName}' replace, preset did not exist`
            );
        }

        await guildPreference.savePreset(presetName, oldUUID);
        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Preset '${presetName}' successfully replaced`
        );

        await sendInfoMessage(messageContext, {
            description: state.localizer.translate(
                messageContext.guildID,
                "command.preset.savedOrReplaced.description",
                {
                    presetLoad: `\`${process.env.BOT_PREFIX}preset load ${presetName}\``,
                }
            ),
            thumbnailUrl: KmqImages.HAPPY,
            title: state.localizer.translate(
                messageContext.guildID,
                "command.preset.replaced.title"
            ),
        });
    }

    static async exportPreset(
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        const presetUUID = await guildPreference.getPresetUUID(presetName);
        if (!presetUUID) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Preset export failed; '${presetName}' does not exist`
            );

            await sendInfoMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.description",
                    { presetName: `\`${presetName}\`` }
                ),
                thumbnailUrl: KmqImages.DEAD,
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.title"
                ),
            });
            return;
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Preset '${presetName}' successfully exported as ${presetUUID}`
        );

        await sendInfoMessage(messageContext, {
            description: state.localizer.translate(
                messageContext.guildID,
                "command.preset.exported.description",
                {
                    presetImport: `${process.env.BOT_PREFIX}preset import`,
                    presetLoad: `${process.env.BOT_PREFIX}preset load`,
                    presetName: `\`${presetName}\``,
                    presetUUID,
                }
            ),
            thumbnailUrl: KmqImages.THUMBS_UP,
            title: state.localizer.translate(
                messageContext.guildID,
                "command.preset.exported.title"
            ),
        });
    }

    static async importPreset(
        presetUUID: string,
        presetName: string,
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        if ((await guildPreference.listPresets()).includes(presetName)) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Preset import failed; '${presetName}' already exists`
            );

            sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.alreadyExists.description",
                    {
                        presetDelete: `${process.env.BOT_PREFIX}preset delete`,
                        presetName,
                        presetNameFormatted: `\`${presetName}\``,
                    }
                ),
                thumbnailUrl: KmqImages.DEAD,
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.alreadyExists.title"
                ),
            });
            return;
        }

        const existingPresetID = await dbContext
            .kmq("game_option_presets")
            .select(["guild_id", "preset_name"])
            .where("option_name", "=", "uuid")
            .andWhere("option_value", "=", JSON.stringify(presetUUID))
            .first();

        if (!existingPresetID) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Tried to load non-existent preset identifier \`${presetUUID}\`.`
            );

            await sendErrorMessage(messageContext, {
                description: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.identifer.description",
                    { presetUUID: `\`${presetUUID}\`` }
                ),
                title: state.localizer.translate(
                    messageContext.guildID,
                    "command.preset.failure.noSuchPreset.title"
                ),
            });
            return;
        }

        const presetOptions = await dbContext
            .kmq("game_option_presets")
            .select(["option_name", "option_value"])
            .where("guild_id", "=", existingPresetID["guild_id"])
            .andWhere("preset_name", "=", existingPresetID["preset_name"]);

        await dbContext.kmq.transaction(async (trx) => {
            const preset = presetOptions
                .filter((option) => option["option_name"] !== "uuid")
                .map((option) => ({
                    guild_id: messageContext.guildID,
                    option_name: option["option_name"],
                    option_value: option["option_value"],
                    preset_name: presetName,
                }));

            preset.push({
                guild_id: messageContext.guildID,
                option_name: "uuid",
                option_value: JSON.stringify(`KMQ-${uuid.v4()}`),
                preset_name: presetName,
            });

            await dbContext
                .kmq("game_option_presets")
                .insert(preset)
                .onConflict(["guild_id", "preset_name", "option_name"])
                .merge()
                .transacting(trx);
        });

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Preset '${presetName}' imported`
        );

        sendInfoMessage(messageContext, {
            description: state.localizer.translate(
                messageContext.guildID,
                "command.preset.imported.description",
                {
                    presetLoad: `${process.env.BOT_PREFIX}preset load`,
                    presetName,
                }
            ),
            thumbnailUrl: KmqImages.THUMBS_UP,
            title: state.localizer.translate(
                messageContext.guildID,
                "command.preset.imported.title"
            ),
        });
    }

    static async listPresets(
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        const presets = await guildPreference.listPresets();
        sendInfoMessage(messageContext, {
            description:
                presets.length > 0
                    ? presets.join("\n")
                    : state.localizer.translate(
                          messageContext.guildID,
                          "command.preset.list.failure.noPresets.description",
                          {
                              presetHelp: `\`${process.env.BOT_PREFIX}help preset\``,
                          }
                      ),
            footerText:
                presets.length > 0
                    ? state.localizer.translate(
                          messageContext.guildID,
                          "command.preset.list.loadInstructions.footer",
                          { presetLoad: `${process.env.BOT_PREFIX}preset load` }
                      )
                    : null,
            title: state.localizer.translate(
                messageContext.guildID,
                "command.preset.list.title"
            ),
        });

        logger.info(
            `${getDebugLogHeader(messageContext)} | Listed all presets`
        );
    }
}
