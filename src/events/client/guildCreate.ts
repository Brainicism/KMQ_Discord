import { DiscordPreferredLocaleToInternal } from "../../constants";
import { IPCLogger } from "../../logger";
import { sendInfoEmbedsWebhook } from "../../helpers/discord_utils";
import LocaleTypeCommand from "../../commands/misc_commands/locale";
import type Eris from "eris";

const logger = new IPCLogger("guildCreate");

/**
 * Handles the 'guildCreate' event
 * @param guild - The Guild object
 */
export default async function guildCreateHandler(
    guild: Eris.Guild,
): Promise<void> {
    logger.info(
        `New server joined: ${guild.id} with ${guild.memberCount} users`,
    );

    if (DiscordPreferredLocaleToInternal[guild.preferredLocale]) {
        await LocaleTypeCommand.updateLocale(
            guild.id,
            DiscordPreferredLocaleToInternal[guild.preferredLocale]!,
        );
    }

    const joinDate: Date = new Date(guild.joinedAt);
    await sendInfoEmbedsWebhook(
        process.env.DEBUG_CHANNEL_WEBHOOK_URL!,
        {
            author: {
                username: guild.name,
                avatarUrl: guild.iconURL as string,
            },
            title: "New Server Joined!",
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
            footerText: `gid: ${
                guild.id
            } | Joined at: ${joinDate.toLocaleDateString(
                "en-US",
            )} ${joinDate.toLocaleTimeString("en-US")}`,
        },
        undefined,
    );
}
