import type Eris from "eris";
import type MessageContext from "../structures/message_context";
import type ParsedMessage from "./parsed_message";
import type Session from "../structures/session";

export default interface PrecheckArgs {
    messageContext: MessageContext;
    session: Session | undefined;
    errorMessage?: string;
    interaction?: Eris.CommandInteraction;
    parsedMessage?: ParsedMessage;
}
