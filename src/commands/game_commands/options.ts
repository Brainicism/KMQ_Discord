import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("options");

export default class OptionsCommand implements BaseCommand {
    aliases = ["settings"];

    help = (guildID: string): HelpDocumentation => ({
        name: "options",
        description: LocalizationManager.translate(
            guildID,
            "command.options.help.description"
        ),
        usage: ",options",
        examples: [],
        priority: 50,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await OptionsCommand.sendOptionsMessage(
            MessageContext.fromMessage(message)
        );
    };

    static sendOptionsMessage = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            null,
            null,
            null,
            null,
            interaction
        );

        logger.info(`${getDebugLogHeader(messageContext)} | Options retrieved`);
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await OptionsCommand.sendOptionsMessage(messageContext, interaction);
    }
}
