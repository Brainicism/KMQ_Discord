import * as Eris from "eris";
import { IPCLogger } from "../../logger.js";
import { getDebugLogHeader } from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import Session from "../../structures/session.js";
import i18n from "../../helpers/localization_manager.js";
import type { CommandInteraction } from "eris";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type { GuildTextableMessage } from "../../types.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type GameSession from "../../structures/game_session.js";
import type HelpDocumentation from "../../interfaces/help.js";
import type MessageContext from "../../structures/message_context.js";

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
