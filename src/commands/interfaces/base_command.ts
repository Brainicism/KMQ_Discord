import CallFunc from "../../interfaces/call_func";
import CommandValidations from "../../interfaces/command_validations";
import HelpDocumentation from "../../interfaces/help";
import PrecheckArgs from "../../interfaces/precheck_args";
import GuildPreference from "../../structures/guild_preference";

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
