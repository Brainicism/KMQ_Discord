import Eris from "eris";

import { getDebugChannel, sendInfoMessage } from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("guildDelete");

/**
 * Handles the 'guildDelete' event
 * @param guild - The Guild object
 */
export default async function guildDeleteHandler(
    guild: Eris.Guild | { id: string }
): Promise<void> {
    logger.info(`Server left: ${guild.id}`);
    const kmqDebugChannel = await getDebugChannel();
    if (!kmqDebugChannel) return;
    const leaveDate = new Date();
    const title = "Server Left";
    const footerText = `gid: ${
        guild.id
    } | Left at: ${leaveDate.toLocaleDateString(
        "en-US"
    )} ${leaveDate.toLocaleTimeString("en-US")}`;

    if (guild instanceof Eris.Guild) {
        await sendInfoMessage(new MessageContext(kmqDebugChannel.id), {
            author: {
                avatarUrl: guild.iconURL,
                username: guild.name,
            },
            fields: [
                {
                    name: "**Member Count**:",
                    value: guild.memberCount.toString(),
                },
                { name: "**Language**:", value: guild.preferredLocale },
                {
                    name: "**Nitro Boosts**:",
                    value: guild.premiumSubscriptionCount.toString(),
                },
            ],
            footerText,
            title,
        });
    } else {
        await sendInfoMessage(new MessageContext(kmqDebugChannel.id), {
            footerText,
            title,
        });
    }
}
