import type Eris from "eris";
import type { GuildTextableMessage } from "../types";
import type ParsedMessage from "./parsed_message";

export default interface CommandArgs {
    message: GuildTextableMessage;
    channel: Eris.TextChannel;
    parsedMessage: ParsedMessage;
}
