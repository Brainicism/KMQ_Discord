import { Client } from "discord.js";
import * as request from "request-promise";
import _logger from "../logger";
import * as _config from "../config/app_config.json";
const config: any = _config;

const logger = _logger("bot_stats_poster");
const TOP_GG_API = "https://top.gg/api/bots/%d/stats";
const DISCORD_BOTS_API = "https://discord.bots.gg/api/v1/bots/%d/stats";

class BotStatsPoster {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }
    start() {
        setInterval(() => { this.postStats(this.client) }, 1800000);
    }

    private async postStats(client: Client) {
        if ("topGGToken" in config){
            this.postTopGgStats(client);
        }
        if ("discordBotsGgToken" in config){
            this.postDiscordGgBotsStats(client);
        }
    }

    private async postTopGgStats(client: Client) {
        try {
            await request({
                method: "POST",
                uri: TOP_GG_API.replace("%d", client.user.id),
                form: {
                    server_count: client.guilds.size
                },
                headers: {
                    "Authorization": config.topGGToken
                }
            })
            logger.info("top.gg server count posted");
        }
        catch (e) {
            logger.error("Error updating top.gg server count. error = " + e);
        }
    }

    private async postDiscordGgBotsStats(client: Client) {
        try {
            await request({
                method: "POST",
                uri: DISCORD_BOTS_API.replace("%d", client.user.id),
                form: {
                    guildCount: client.guilds.size
                },
                headers: {
                    "Authorization": config.discordBotsGgToken
                }
            })
            logger.info("discord.bots.gg server count posted")
        } catch (e) {
            logger.error("Error updating discord.bots.gg server count. error = " + e);
        }
    }
}

export default BotStatsPoster;
