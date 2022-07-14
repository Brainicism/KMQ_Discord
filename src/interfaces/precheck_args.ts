import type MessageContext from "../structures/message_context";
import type Session from "../structures/session";

export default interface PrecheckArgs {
    messageContext: MessageContext;
    session: Session;
    errorMessage?: string;
}
