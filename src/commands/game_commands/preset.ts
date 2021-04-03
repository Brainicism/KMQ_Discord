import { getDebugLogHeader, sendErrorMessage, sendInfoMessage, sendOptionsMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";
import GuildPreference from "../../structures/guild_preference";
import { KmqImages } from "../../constants";
import { GameOption } from "../../types";

const logger = _logger("preset");
const PRESET_NAME_MAX_LENGTH = 25;

enum PresetAction {
    LIST = "list",
    SAVE = "save",
    LOAD = "load",
    DELETE = "delete",
}

export default class PresetCommand implements BaseCommand {
    aliases = ["presets"];

    validations = {
        minArgCount: 1,
        maxArgCount: 2,
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
        usage: "!preset [list | add | load | delete] {preset_name}",
        examples: [
            {
                example: "`!preset list`",
                explanation: "Lists all of the server's presets",
            },
            {
                example: "`!preset save [preset_name]`",
                explanation: "Saves the current game options as a preset",
            },
            {
                example: "`!preset load [preset_name]`",
                explanation: "Loads the mentioned preset into the game options",
            },
            {
                example: "`!preset delete [preset_name]`",
                explanation: "Deletes the mentioned preset",
            },
        ],
        priority: 200,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const presetAction = parsedMessage.components[0] as PresetAction;
        const messageContext = MessageContext.fromMessage(message);
        if (presetAction === PresetAction.LIST) {
            this.listPresets(guildPreference, messageContext);
            return;
        }
        const presetName = parsedMessage.components[1];
        if (!presetName) {
            sendErrorMessage(messageContext, { title: "Preset Name Missing", description: "You must specify a preset name", thumbnailUrl: KmqImages.NOT_IMPRESSED });
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
            default:
        }
    }

    async deletePreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        const deleted = await guildPreference.deletePreset(presetName);
        if (!deleted) {
            logger.warn(`${getDebugLogHeader(messageContext)} | Tried to delete non-existent preset '${presetName}'`);
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset \`${presetName}\` doesn't exist` });
            return;
        }
        await sendInfoMessage(messageContext, { title: "Preset Deleted", description: `Preset \`${presetName}\` successfully deleted`, thumbnailUrl: KmqImages.NOT_IMPRESSED });
        logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully deleted`);
    }

    async loadPreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        try {
            await guildPreference.loadPreset(presetName);
            sendOptionsMessage(messageContext, guildPreference, { option: GameOption.PRESET, reset: false });
            logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully loaded`);
        } catch (e) {
            logger.warn(`${getDebugLogHeader(messageContext)} | Tried to load non-existent preset '${presetName}'`);
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset \`${presetName}\` doesn't exist` });
        }
    }

    async savePreset(presetName: string, guildPreference: GuildPreference, messageContext: MessageContext) {
        if (presetName.length > PRESET_NAME_MAX_LENGTH) {
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset name must be shorter than ${PRESET_NAME_MAX_LENGTH} characters` });
            return;
        }
        try {
            await guildPreference.savePreset(presetName);
            logger.info(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' successfully saved`);
            await sendInfoMessage(messageContext, { title: "Preset Loaded", description: `You can load this preset later with \`${process.env.BOT_PREFIX}preset load ${presetName}\``, thumbnailUrl: KmqImages.HAPPY });
        } catch (e) {
            logger.warn(`${getDebugLogHeader(messageContext)} | Preset '${presetName}' already exists`);
            await sendErrorMessage(messageContext, { title: "Preset Error", description: `Preset \`${presetName}\` already exists. You can delete the old one with \`${process.env.BOT_PREFIX}preset delete ${presetName}\``, thumbnailUrl: KmqImages.DEAD });
        }
    }

    async listPresets(guildPreference: GuildPreference, messageContext: MessageContext) {
        const presets = await guildPreference.listPresets();
        sendInfoMessage(messageContext, { title: "Available Presets", description: JSON.stringify(presets) });
        logger.info(`${getDebugLogHeader(messageContext)} | Listed all presets`);
    }
}
