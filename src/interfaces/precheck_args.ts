import type Session from "../structures/session";
import type { GuildTextableMessage } from "../types";

export default interface PrecheckArgs {
    message: GuildTextableMessage;
    session: Session;
    errorMessage?: string;
}
