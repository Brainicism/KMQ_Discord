import type CallFunc from "../../interfaces/call_func.js";
import type CommandValidations from "../../interfaces/command_validations.js";
import type Eris from "eris";
import type HelpDocumentation from "../../interfaces/help.js";
import type MessageContext from "../../structures/message_context.js";
import type PrecheckArgs from "../../interfaces/precheck_args.js";

export type DefaultSlashCommand = Omit<
    Eris.ChatInputApplicationCommandStructure,
    "name" | "name_localizations" | "description" | "description_localizations"
>;

export default interface BaseCommand {
    call: CallFunc;
    help?: (guildID: string) => HelpDocumentation;
    aliases?: Array<string>;
    slashCommandAliases?: string[];
    validations?: CommandValidations;
    preRunChecks?: Array<{
        checkFn: (precheckArgs: PrecheckArgs) => Promise<boolean>;
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
