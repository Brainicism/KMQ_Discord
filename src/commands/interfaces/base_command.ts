import type CallFunc from "../../interfaces/call_func";
import type CommandValidations from "../../interfaces/command_validations";
import type Eris from "eris";
import type HelpDocumentation from "../../interfaces/help";
import type MessageContext from "../../structures/message_context";
import type PrecheckArgs from "../../interfaces/precheck_args";

export type DefaultSlashCommand = Omit<
    Eris.ChatInputApplicationCommandStructure,
    "name" | "name_localizations" | "description" | "description_localizations"
>;

export default interface BaseCommand {
    call: CallFunc;
    help?: (guildID: string) => HelpDocumentation;
    aliases?: Array<string>;
    validations?: CommandValidations;
    preRunChecks?: Array<{
        checkFn: (precheckArgs: PrecheckArgs) => boolean | Promise<boolean>;
        errorMessage?: string;
    }>;
    slashCommands?: () => Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    >;
    processChatInputInteraction?: (
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ) => Promise<void>;
}
