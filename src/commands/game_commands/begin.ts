import CommandPrechecks from "../../command_prechecks";
import type CommandArgs from "../../interfaces/command_args";
import MessageContext from "../../structures/message_context";
import type BaseCommand from "../interfaces/base_command";
import PlayCommand from "./play";

export default class BeginCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await PlayCommand.beginTeamsGame(MessageContext.fromMessage(message));
    };
}
