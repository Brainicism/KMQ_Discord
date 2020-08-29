import Eris from "eris";
import Axios from "axios";
import _logger from "../logger";
import config from "../config/app_config.json";
const logger = _logger("bot_stats_poster");

interface BotListing {
    endpoint: string;
    payloadKeyName: string;
    name: string;
}

const BOT_LISTING_SITES: { [siteName: string]: BotListing } = {
    topGGToken: {
        endpoint: "https://top.gg/api/bots/%d/stats",
        payloadKeyName: "server_count",
        name: "top.gg"
    },
    discordBotsGgToken: {
        endpoint: "https://discord.bots.gg/api/v1/bots/%d/stats",
        payloadKeyName: "guildCount",
        name: "discord.bots.gg"
    },
    discordBotListToken: {
        endpoint: "https://discordbotlist.com/api/v1/bots/%d/stats",
        payloadKeyName: "guilds",
        name: "discordbotlist.com"
    }
}
export default class BotStatsPoster {
    private client: Eris.Client;

    constructor(client: Eris.Client) {
        this.client = client;
    }
    start() {
        this.postStats(this.client)
        setInterval(() => { this.postStats(this.client) }, 1800000);
    }

    private async postStats(client: Eris.Client) {
        ["topGGToken", "discordBotsGgToken", "discordBotListToken"].filter((siteConfigKeyName) => siteConfigKeyName in config).forEach((siteConfigKeyName) => {
            this.postStat(client, siteConfigKeyName);
        })
    }

    private async postStat(client: Eris.Client, siteConfigKeyName: string) {
        const botListing = BOT_LISTING_SITES[siteConfigKeyName];
        try {
            await Axios.post(botListing.endpoint.replace("%d", client.user.id), {
                [botListing.payloadKeyName]: client.guilds.size
            }, {
                headers: {
                    "Authorization": config[siteConfigKeyName]
                }
            });
            logger.info(`${botListing.name} server count posted`);
        }
        catch (e) {
            logger.error(`Error updating ${botListing.name} server count. error = ${e}`);
        }
    }
}
