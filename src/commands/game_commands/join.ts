import CommandPrechecks from "../../command_prechecks";
import GameType from "../../enums/game_type";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import i18n from "../../helpers/localization_manager";
import type CommandArgs from "../../interfaces/command_args";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import type BaseCommand from "../interfaces/base_command";
import PlayCommand, { PlayTeamsAction } from "./play";

const COMMAND_NAME = "join";
const logger = new IPCLogger(COMMAND_NAME);

export default class JoinCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    aliases = ["j"];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        if (parsedMessage.components.length === 0) {
            logger.warn(`${getDebugLogHeader(message)} | Missing team name.`);
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: i18n.translate(
                    message.guildID,
                    "command.join.failure.joinError.title",
                ),
                description: i18n.translate(
                    message.guildID,
                    "command.join.failure.joinError.noTeamName.description",
                    {
                        joinCommand: clickableSlashCommand(
                            "play",
                            GameType.TEAMS,
                            PlayTeamsAction.JOIN,
                        ),
                    },
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
