import Eris from "eris";
import GameSession from "../models/game_session";
import { ParsedMessage } from "../types";

export interface CommandArgs {
    gameSessions?: { [guildID: string]: GameSession }
    message?: Eris.Message<Eris.GuildTextableChannel>;
    parsedMessage?: ParsedMessage,
    botPrefix?: string;
}

export interface CommandValidations {
    minArgCount: number,
    maxArgCount: number,
    arguments: Array<{
        type: "number" | "boolean" | "enum" | "char",
        name: string,
        minValue?: number,
        maxValue?: number,
        enums?: Array<string>
    }>
}

interface CallFunc {
    (args: CommandArgs): Promise<void>
}

export default class BaseCommand {
    call: CallFunc;
    help: {
        name: string,
        description: string,
        usage: string,
        examples: Array<{ example: string, explanation: string }>
    };
    aliases?: Array<string>;
    validations?: CommandValidations
}
