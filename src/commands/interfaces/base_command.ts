import Eris from "eris";
import GameSession from "../../structures/game_session";
import { GuildTextableMessage, ParsedMessage } from "../../types";

export interface CommandArgs {
    gameSessions: { [guildID: string]: GameSession }
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
    }>
}

export interface CallFunc {
    (args: CommandArgs): Promise<void>;
}

export default interface BaseCommand {
    call: CallFunc;
    help?: {
        name: string;
        description: string;
        usage: string;
        examples: Array<{ example: string, explanation: string }>;
        priority: number;
        actionRowComponents?: Eris.ActionRowComponents[];
    };
    aliases?: Array<string>;
    validations?: CommandValidations;
    preRunChecks?: Array<{ checkFn: (message: GuildTextableMessage, gameSession: GameSession, errorMessage?: string) => boolean | Promise<boolean>, errorMessage?: string }>;
}
