import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import MessageContext from "../../structures/message_context";
import PlayCommand from "./play";
import i18n from "../../helpers/localization_manager";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("join");

export default class JoinCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        if (parsedMessage.components.length === 0) {
            logger.warn(`${getDebugLogHeader(message)} | Missing team name.`);
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: i18n.translate(
                    message.guildID,
                    "command.join.failure.joinError.title",
                ),
                description: i18n.translate(
                    message.guildID,
                    "command.join.failure.joinError.noTeamName.description",
                    { joinCommand: "/play teams join" },
                ),
            });
            return;
        }

        // Limit length to 128 chars, filter out Discord markdown modifiers
        // Ignore: \ _ * ~ | `
        const teamName = parsedMessage.argument
            .replace(/\\|_|\*|~|\||`/gm, "")
            .substring(0, 128);

        await PlayCommand.joinTeamsGame(
            MessageContext.fromMessage(message),
            teamName,
        );
    };
}
