import type { GuildTextableMessage } from "../types";
import type Session from "../structures/session";

export default interface PrecheckArgs {
    message: GuildTextableMessage;
    session: Session;
    errorMessage?: string;
}
