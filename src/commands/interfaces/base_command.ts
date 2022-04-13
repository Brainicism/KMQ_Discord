import Eris from "eris";
import { PrecheckArgs } from "../../command_prechecks";
import GameSession from "../../structures/game_session";
import GuildPreference from "../../structures/guild_preference";
import { GuildTextableMessage, ParsedMessage } from "../../types";

export interface CommandArgs {
    gameSessions: { [guildID: string]: GameSession };
    message: GuildTextableMessage;
    channel: Eris.TextChannel;
    parsedMessage: ParsedMessage;
}

export interface CommandValidations {
    minArgCount: number;
    maxArgCount?: number;
    arguments: Array<{
        type: "number" | "boolean" | "enum" | "char";
        name: string;
        minValue?: number;
        maxValue?: number;
        enums?: Array<string>;
    }>;
}

export interface CallFunc {
    (args: CommandArgs): Promise<void>;
}

export interface Help {
    name: string;
    description: string;
    usage: string;
    examples: Array<{ example: string; explanation: string }>;
    actionRowComponents?: Eris.ActionRowComponents[];
    priority?: number;
}

export interface HelpFunc {
    (guildID: string): Help;
}

export default interface BaseCommand {
    call: CallFunc;
    help?: HelpFunc;
    aliases?: Array<string>;
    validations?: CommandValidations;
    preRunChecks?: Array<{
        checkFn: (precheckArgs: PrecheckArgs) => boolean | Promise<boolean>;
        errorMessage?: string;
    }>;
    resetPremium?: (guildPreference: GuildPreference) => Promise<void>;
}
