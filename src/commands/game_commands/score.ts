import { IPCLogger } from "../../logger";
import { getDebugLogHeader } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { CommandInteraction } from "eris";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { GuildTextableMessage } from "src/types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameSession from "../../structures/game_session";
import type HelpDocumentation from "../../interfaces/help";
import type MessageContext from "../../structures/message_context";

const COMMAND_NAME = "score";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class ScoreCommand implements BaseCommand {
    aliases = ["scoreboard", "sb"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.score.help.description"),
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
        await ScoreCommand.showScore(message);
    };

    static async showScore(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
    ): Promise<void> {
        const gameSession = Session.getSession(
            messageOrInteraction.guildID as string,
        ) as GameSession;

        await gameSession.sendScoreboardMessage(messageOrInteraction);
        logger.info(
            `${getDebugLogHeader(messageOrInteraction)} | Score retrieved`,
        );
    }

    /**
     * @param interaction - The interaction
     * @param _messageContext - Unused
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        _messageContext: MessageContext,
    ): Promise<void> {
        await ScoreCommand.showScore(interaction);
    }
}
