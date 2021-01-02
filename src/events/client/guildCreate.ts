import Eris from "eris";
import _logger from "../../logger";
import { sendMessage, EMBED_INFO_COLOR, getDebugChannel } from "../../helpers/discord_utils";

const logger = _logger("guildCreate");

export default async function guildCreateHandler(guild: Eris.Guild) {
    logger.info(`New server joined: ${guild.id} with ${guild.memberCount} users`);
    const kmqDebugChannel = getDebugChannel();
    if (!kmqDebugChannel) return;
    const joinDate: Date = new Date(guild.joinedAt);
    await sendMessage(kmqDebugChannel, {
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: guild.name,
                icon_url: guild.iconURL,
            },
            title: "New server joined!",
            fields: [
                { name: "**Member Count**:", value: guild.memberCount.toString() },
                { name: "**Region**:", value: guild.region },
                { name: "**Language**:", value: guild.preferredLocale },
                { name: "**Nitro Boosts**:", value: guild.premiumSubscriptionCount.toString() },
            ],
            footer: {
                text: `Joined at: ${joinDate.toLocaleDateString("en-US")} ${joinDate.toLocaleTimeString("en-US")}`,
            },
        },
    });
}
