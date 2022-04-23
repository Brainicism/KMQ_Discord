import type CallFunc from "../../interfaces/call_func";
import type CommandValidations from "../../interfaces/command_validations";
import type HelpDocumentation from "../../interfaces/help";
import type PrecheckArgs from "../../interfaces/precheck_args";
import type GuildPreference from "../../structures/guild_preference";

export default interface BaseCommand {
    call: CallFunc;
    help?: (guildID: string) => HelpDocumentation;
    aliases?: Array<string>;
    validations?: CommandValidations;
    preRunChecks?: Array<{
        checkFn: (precheckArgs: PrecheckArgs) => boolean | Promise<boolean>;
        errorMessage?: string;
    }>;
    resetPremium?: (guildPreference: GuildPreference) => Promise<void>;
    isUsingPremiumOption?: (guildPreference: GuildPreference) => boolean;
}
