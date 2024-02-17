import CommandPrechecks from "../../command_prechecks";
import MessageContext from "../../structures/message_context";
import PlayCommand from "./play";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

export default class BeginCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await PlayCommand.beginTeamsGame(MessageContext.fromMessage(message));
    };
}
