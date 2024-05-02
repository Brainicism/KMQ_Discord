import { IPCLogger } from "../../logger";
import { sendInfoEmbedsWebhook } from "../../helpers/discord_utils";
import Eris from "eris";
import Session from "../../structures/session";

const logger = new IPCLogger("guildDelete");

/**
 * Handles the 'guildDelete' event
 * @param guild - The Guild object
 */
export default async function guildDeleteHandler(
    guild: Eris.Guild | { id: string },
): Promise<void> {
    logger.info(`Server left: ${guild.id}`);
    const leaveDate = new Date();
    const title = "Server Left";
    const footerText = `gid: ${
        guild.id
    } | Left at: ${leaveDate.toLocaleDateString(
        "en-US",
    )} ${leaveDate.toLocaleTimeString("en-US")}`;

    if (guild instanceof Eris.Guild) {
        await sendInfoEmbedsWebhook(
            process.env.DEBUG_CHANNEL_WEBHOOK_URL!,
            {
                author: {
                    username: guild.name,
                    avatarUrl: guild.iconURL as string,
                },
                title,
                fields: [
                    {
                        name: "**Member Count**:",
                        value: guild.memberCount.toString(),
                    },
                    { name: "**Language**:", value: guild.preferredLocale },
                    {
                        name: "**Nitro Boosts**:",
                        value: (guild.premiumSubscriptionCount ?? 0).toString(),
                    },
                ],
                footerText,
            },
            undefined,
            undefined,
            undefined,
        );
    } else {
        await sendInfoEmbedsWebhook(
            process.env.DEBUG_CHANNEL_WEBHOOK_URL!,
            {
                title,
                footerText,
            },
            undefined,
            undefined,
            undefined,
        );
    }

    await Session.getSession(guild.id)?.endSession("Guild left", false);
}
