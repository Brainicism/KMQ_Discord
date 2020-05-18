// import * as Discord from "discord.js";
// import GameSession from "../models/game_session";
// import GuildPreference from "../models/guild_preference";
// import { Pool } from "promise-mysql";

// interface CallFunc {
//     (client?: Discord.Client, gameSessions?: Array<GameSession>, guildPreference?: GuildPreference, message?: Discord.Message, db?: Pool,
//         parsedMessage?: any, botPrefix?: string): void
// }

// class BaseCommand {
//     call: CallFunc;
//     help: {
//         name: string,
//         description: string,
//         usage: string,
//         arguments: Array<{name: number, description: string}>
//     };
//     aliases: Array<string>;
// }