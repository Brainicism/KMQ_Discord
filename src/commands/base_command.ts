import Eris from "eris";
import GameSession from "../structures/game_session";
import { GuildTextableMessage, ParsedMessage } from "../types";

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

interface CallFunc {
    (args: CommandArgs): Promise<void>;
}

export default class BaseCommand {
    call: CallFunc;
    help?: {
        name: string;
        description: string;
        usage: string;
        examples: Array<{ example: string, explanation: string }>;
        priority: number;
    };
    aliases?: Array<string>;
    validations?: CommandValidations;
}
