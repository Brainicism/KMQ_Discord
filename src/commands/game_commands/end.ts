import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    tryCreateInteractionSuccessAcknowledgement,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "end";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class EndCommand implements BaseCommand {
    aliases = ["stop", "e"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.end.help.description"),
        examples: [],
        priority: 1020,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await EndCommand.endGame(MessageContext.fromMessage(message));
    };

    static endGame = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        const session = Session.getSession(messageContext.guildID);
        if (interaction) {
            await tryCreateInteractionSuccessAcknowledgement(
                interaction,
                i18n.translate(
                    messageContext.guildID,
                    "command.end.interaction.title",
                ),
                i18n.translate(
                    messageContext.guildID,
                    "command.end.interaction.description",
                ),
            );
        }

        await session.endSession("Ended by user", false);
        logger.info(`${getDebugLogHeader(messageContext)} | Session ended`);
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await EndCommand.endGame(messageContext, interaction);
    }
}
