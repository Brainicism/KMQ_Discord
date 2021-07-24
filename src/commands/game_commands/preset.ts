import * as uuid from "uuid";
import { getDebugLogHeader, sendErrorMessage, sendInfoMessage, sendOptionsMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import GuildPreference from "../../structures/guild_preference";
import { KmqImages } from "../../constants";
import { GameOption } from "../../types";
import dbContext from "../../database_context";

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

    help = {
        name: "preset",
        description: "Various actions to save/load game option presets. Preset name must be one word long.",
        usage: ",preset [list | save | load | delete | export] {preset_name}\n\n,preset import [preset_identifier] [preset_name]",
        examples: [
            {
                example: "`,preset list`",
                explanation: "Lists all of the server's presets",
            },
            {
                example: "`,preset save [preset_name]`",
                explanation: "Saves the current game options as a preset",
            },
            {
                example: "`,preset load [preset_name]`",
                explanation: "Loads the mentioned preset into the game options",
            },
            {
                example: "`,preset replace [preset_name]`",
                explanation: "Replaces the current game options as the mentioned preset",
            },
            {
                example: "`,preset delete [preset_name]`",
                explanation: "Deletes the mentioned preset",
            },
            {
                example: "`,preset export [preset_name]`",
                explanation: "Returns a unique identifier associated with the mentioned preset",
            },
            {
                example: "`,preset import [preset_identifier] [preset_name]`",
                explanation: "Creates a new preset with name `preset_name` using an exported preset identifier",
            },
        ],
        priority: 200,
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        const presetAction = parsedMessage.components[0] as PresetAction || null;
        const messageContext = MessageContext.fromMessage(message);
        if (!presetAction || presetAction === PresetAction.LIST) {
            this.listPresets(guildPreference, messageContext);
            return;
        }

        let presetUUID: string;
        if (presetAction === PresetAction.IMPORT) {
            presetUUID = parsedMessage.components[1];
            if (!presetUUID) {
                sendErrorMessage(messageContext, { title: "Preset Identifer Missing", description: `You must specify a preset identifier. Use \`${process.env.BOT_PREFIX}preset export [preset_name]\` to retrieve a preset's identifier.`, thumbnailUrl: KmqImages.NOT_IMPRESSED });
                logger.warn(`${getDebugLogHeader(message)} | Preset UUID not specified`);
                return;
            }
        }

        const presetName = parsedMessage.components[presetAction !== PresetAction.IMPORT ? 1 : 2];
        if (!presetName) {
            sendErrorMessage(messageContext, { title: "Preset Name Missing", description: "You must specify a preset name.", thumbnailUrl: KmqImages.NOT_IMPRESSED });
            logger.warn(`${getDebugLogHeader(message)} | Preset name not specified`);
            return;
        }

        switch (presetAction) {
            case PresetAction.SAVE:
                await this.savePreset(presetName, guildPreference, messageContext);
                break;
            case PresetAction.LOAD:
                await this.loadPreset(presetName, guildPreference, messageContext);
                break;
            case PresetAction.DELETE:
                await this.deletePreset(presetName, guildPreference, messageContext);
                break;
            case PresetAction.REPLACE:
                await this.replacePreset(presetName, guildPreference, messageContext);
                break;
            case PresetAction.EXPORT:
                await this.exportPreset(presetName, guildPreference, messageContext);
                break;
            case PresetAction.IMPORT:
                await this.importPreset(presetUUID, presetName, guildPreference, messageContext);
                break;
            default:
        }
    };

    async deletePreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        const deleteResult = await guildPreference.deletePreset(presetName);
        if (!deleteResult) {
            logger.warn(`${getDebugLogHeader(messageContext)} | Tried to delete non-existent preset '${presetName}'`);
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset \`${presetName}\` doesn't exist.` });
            return;
        }

        await sendInfoMessage(messageContext, { title: "Preset Deleted", description: `Preset \`${presetName}\` successfully deleted.`, thumbnailUrl: KmqImages.NOT_IMPRESSED });
        logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully deleted.`);
    }

    async loadPreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        const loadResult = await guildPreference.loadPreset(presetName);
        if (loadResult) {
            sendOptionsMessage(messageContext, guildPreference, { option: GameOption.PRESET, reset: false });
            logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully loaded`);
        } else {
            logger.warn(`${getDebugLogHeader(messageContext)} | Tried to load non-existent preset '${presetName}'`);
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset \`${presetName}\` doesn't exist.` });
        }
    }

    async savePreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        const presets = await guildPreference.listPresets();
        if (presets.length >= MAX_NUM_PRESETS) {
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Each guild may only have up to ${MAX_NUM_PRESETS} presets. Please delete some before adding more.` });
            return;
        }

        if (presetName.length > PRESET_NAME_MAX_LENGTH) {
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset name must be at most ${PRESET_NAME_MAX_LENGTH} characters.` });
            return;
        }

        const saveResult = await guildPreference.savePreset(presetName);
        if (saveResult) {
            logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully saved`);
            await sendInfoMessage(messageContext, { title: "Preset Saved", description: `You can load this preset later with \`${process.env.BOT_PREFIX}preset load ${presetName}\`.`, thumbnailUrl: KmqImages.HAPPY });
        } else {
            logger.warn(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' already exists`);
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset \`${presetName}\` already exists. You can delete the old one with \`${process.env.BOT_PREFIX}preset delete ${presetName}\`.`, thumbnailUrl: KmqImages.DEAD });
        }
    }

    async replacePreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        const oldUUID = await guildPreference.deletePreset(presetName);
        if (!oldUUID) {
            logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' replace, preset did not exist`);
        }

        await guildPreference.savePreset(presetName, oldUUID);
        logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully replaced`);
        await sendInfoMessage(messageContext, { title: "Preset Replaced", description: `You can load this preset later with \`${process.env.BOT_PREFIX}preset load ${presetName}\`.`, thumbnailUrl: KmqImages.HAPPY });
    }

    async exportPreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        const presetUUID = await guildPreference.getPresetUUID(presetName);
        if (!presetUUID) {
            await sendInfoMessage(messageContext, { title: "Preset Export Failed", description: `The given preset \`${presetName}\` does not exist.`, thumbnailUrl: KmqImages.DEAD });
            logger.warn(`${getDebugLogHeader(messageContext)} | Preset export failed; '${presetName}' does not exist`);
            return;
        }

        await sendInfoMessage(messageContext, { title: "Preset Exported Successfully", description: `Import \`${presetName}\` in other servers using \`${process.env.BOT_PREFIX}preset import ${presetUUID} [preset_name]\``, thumbnailUrl: KmqImages.HAPPY });
        logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully exported as ${presetUUID}`);
    }

    async importPreset(presetUUID: string, presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        if ((await guildPreference.listPresets()).includes(presetName)) {
            sendErrorMessage(messageContext, { title: "Preset Import Failed", description: `Preset \`${presetName}\` already exists. You can delete the old one with \`${process.env.BOT_PREFIX}preset delete ${presetName}\`.`, thumbnailUrl: KmqImages.DEAD });
            logger.warn(`${getDebugLogHeader(messageContext)} | Preset import failed; '${presetName}' already exists`);
            return;
        }

        const existingPresetIdentifiers = await dbContext.kmq("game_option_presets")
            .select(["guild_id", "preset_name"])
            .where("option_value", "=", presetUUID)
            .first();

        const presetOptions = await dbContext.kmq("game_option_presets")
            .select(["option_name", "option_value"])
            .where("guild_id", "=", existingPresetIdentifiers["guild_id"])
            .andWhere("preset_name", "=", existingPresetIdentifiers["preset_name"]);

        for (const option of presetOptions.filter((x) => x["option_name"] !== "uuid")) {
            await dbContext.kmq("game_option_presets")
                .insert({
                    guild_id: messageContext.guildID,
                    preset_name: presetName,
                    option_name: option["option_name"],
                    option_value: option["option_value"],
                });
        }

        await dbContext.kmq("game_option_presets")
            .insert({
                guild_id: messageContext.guildID,
                preset_name: presetName,
                option_name: "uuid",
                option_value: uuid.v4(),
            });
        sendInfoMessage(messageContext, { title: "Preset Imported Successfully", description: `Load the newly imported preset using \`${process.env.BOT_PREFIX}preset load ${presetName}\``, thumbnailUrl: KmqImages.HAPPY });
    }

    async listPresets(guildPreference: GuildPreference, messageContext: MessageContext) {
        const presets = await guildPreference.listPresets();
        sendInfoMessage(messageContext, {
            title: "Available Presets",
            description: presets.length > 0 ? presets.join("\n") : "You have no presets. Refer to `,help preset` to see how to create one.",
            footerText: presets.length > 0 ? "Load a preset with ,preset load [presetName]" : null,
        });
        logger.info(`${getDebugLogHeader(messageContext)} | Listed all presets`);
    }
}
