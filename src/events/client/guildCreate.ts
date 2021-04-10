import Eris from "eris";
import _logger from "../../logger";
import { getDebugChannel, sendInfoMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";

const logger = _logger("guildCreate");

export default async function guildCreateHandler(guild: Eris.Guild) {
    logger.info(`New server joined: ${guild.id} with ${guild.memberCount} users`);
    const kmqDebugChannel = getDebugChannel();
    if (!kmqDebugChannel) return;
    const joinDate: Date = new Date(guild.joinedAt);
    await sendInfoMessage(new MessageContext(kmqDebugChannel.id), {
        author: {
            username: guild.name,
            avatarUrl: guild.iconURL,
        },
        title: "New server joined!",
        fields: [
            { name: "**Member Count**:", value: guild.memberCount.toString() },
            { name: "**Region**:", value: guild.region },
            { name: "**Language**:", value: guild.preferredLocale },
            { name: "**Nitro Boosts**:", value: guild.premiumSubscriptionCount.toString() },
        ],
        footerText: `ID: ${guild.id} | Joined at: ${joinDate.toLocaleDateString("en-US")} ${joinDate.toLocaleTimeString("en-US")}`,
    });
}
