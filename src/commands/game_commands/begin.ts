import CommandPrechecks from "../../command_prechecks.js";
import MessageContext from "../../structures/message_context.js";
import PlayCommand from "./play.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";

// eslint-disable-next-line import/no-unused-modules
export default class BeginCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await PlayCommand.beginTeamsGame(MessageContext.fromMessage(message));
    };
}
