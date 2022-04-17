import Eris from "eris";
import { GuildTextableMessage } from "../types";
import ParsedMessage from "./parsed_message";

export default interface CommandArgs {
    message: GuildTextableMessage;
    channel: Eris.TextChannel;
    parsedMessage: ParsedMessage;
}
