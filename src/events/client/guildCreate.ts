import Eris from "eris";
import { IPCLogger } from "../../logger";
import { getDebugChannel, sendInfoMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("guildCreate");

/**
 * Handles the 'guildCreate' event
 * @param guild - The Guild object
 */
export default async function guildCreateHandler(
    guild: Eris.Guild
): Promise<void> {
    logger.info(
        `New server joined: ${guild.id} with ${guild.memberCount} users`
    );
    const kmqDebugChannel = await getDebugChannel();
    if (!kmqDebugChannel) return;
    const joinDate: Date = new Date(guild.joinedAt);
    await sendInfoMessage(new MessageContext(kmqDebugChannel.id), {
        author: {
            username: guild.name,
            avatarUrl: guild.iconURL,
        },
        title: "New Server Joined!",
        fields: [
            { name: "**Member Count**:", value: guild.memberCount.toString() },
            { name: "**Language**:", value: guild.preferredLocale },
            {
                name: "**Nitro Boosts**:",
                value: guild.premiumSubscriptionCount.toString(),
            },
        ],
        footerText: `gid: ${
            guild.id
        } | Joined at: ${joinDate.toLocaleDateString(
            "en-US"
        )} ${joinDate.toLocaleTimeString("en-US")}`,
    });
}
