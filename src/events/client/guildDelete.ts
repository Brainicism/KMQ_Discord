import Eris from "eris";
import { IPCLogger } from "../../logger";
import { getDebugChannel, sendInfoMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("guildDelete");

export default async function guildDeleteHandler(guild: Eris.Guild | { id: string }) {
    logger.info(`Server left: ${guild.id}`);
    const kmqDebugChannel = getDebugChannel();
    if (!kmqDebugChannel) return;
    const leaveDate = new Date();
    const title = "Server left";
    const footerText = `gid: ${guild.id} | Left at: ${leaveDate.toLocaleDateString("en-US")} ${leaveDate.toLocaleTimeString("en-US")}`;
    if (!kmqDebugChannel) return;
    if (guild instanceof Eris.Guild) {
        await sendInfoMessage(new MessageContext(kmqDebugChannel.id), {
            author: {
                username: guild.name,
                avatarUrl: guild.iconURL,
            },
            title,
            fields: [
                { name: "**Member Count**:", value: guild.memberCount.toString() },
                { name: "**Language**:", value: guild.preferredLocale },
                { name: "**Nitro Boosts**:", value: guild.premiumSubscriptionCount.toString() },
            ],
            footerText,
        });
    } else {
        await sendInfoMessage(new MessageContext(kmqDebugChannel.id), {
            title,
            footerText,
        });
    }
}
