import Eris from "eris";
import _logger from "../../logger";
import { state } from "../../kmq";
import { sendMessage, EMBED_INFO_COLOR } from "../../helpers/discord_utils";
const logger = _logger("guildCreate");

export default async function guildCreateHandler(guild: Eris.Guild) {
    const client = state.client;
    logger.info(`New server joined: ${guild.id} with ${guild.memberCount} users`);
    if (!process.env.DEBUG_SERVER_ID || !process.env.DEBUG_TEXT_CHANNEL_ID) return;
    const kmqDebugChannel: Eris.TextChannel =
        <Eris.TextChannel>client.guilds.get(process.env.DEBUG_SERVER_ID)
            .channels.get(process.env.DEBUG_TEXT_CHANNEL_ID);
    const joinDate: Date = new Date(guild.joinedAt);
    await sendMessage({ channel: kmqDebugChannel }, {
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: guild.name,
                icon_url: guild.iconURL
            },
            title: `New server joined!`,
            fields: [
                {name: `**Member Count**:`, value: guild.memberCount.toString()},
                {name: `**Region**:`, value: guild.region},
                {name: `**Language**:`, value: guild.preferredLocale},
                {name: `**Nitro Boosts**:`, value: guild.premiumSubscriptionCount.toString()}
            ],
            footer: {
                text: `Joined at: ${joinDate.toLocaleDateString("en-US")} ${joinDate.toLocaleTimeString("en-US")}`
            }
        }
    })
}
