import { DEFAULT_LOCALE } from "./constants";
import RateLimiter from "./rate_limiter";
import "reflect-metadata";
import {
    deserializeArray,
    plainToClass,
    plainToInstance,
    serialize,
} from "class-transformer";
import type { IPC } from "eris-fleet";
import GameSession from "./structures/game_session";
import type KmqClient from "./kmq_client";
import type ListeningSession from "./structures/listening_session";
import type LocaleType from "./enums/locale_type";

export default class State {
    static gameSessions: { [guildID: string]: GameSession } = {};
    static listeningSessions: { [guildID: string]: ListeningSession } = {};
    static client: KmqClient;
    static aliases: {
        artist: { [artistName: string]: Array<string> };
        song: { [songName: string]: Array<string> };
    } = {
        artist: {},
        song: {},
    };

    static processStartTime: number = Date.now();
    static ipc: IPC;
    static rateLimiter = new RateLimiter(15, 30);
    static bonusArtists: Set<string> = new Set<string>();
    static locales: { [guildID: string]: LocaleType } = {};
    static getGuildLocale(guildID: string): LocaleType {
        return State.locales[guildID] ?? DEFAULT_LOCALE;
    }

    static async saveToCentralStore(): Promise<void> {
        await State.ipc.centralStore.set(
            "gameSessions",
            serialize(Object.values(State.gameSessions))
        );

        await State.ipc.centralStore.set(
            "listeningSessions",
            serialize(Object.values(State.listeningSessions))
        );
    }

    static async loadFromCentralStore(): Promise<void> {
        const loadedGameSessionData = await State.ipc.centralStore.get(
            "gameSessions"
        );

        const loadedListeningSessionData = await State.ipc.centralStore.get(
            "listeningSessions"
        );

        if (loadedGameSessionData) {
            const x = deserializeArray(GameSession, loadedGameSessionData);
            State.gameSessions = x.reduce(
                (acc, curr) => ((acc[curr.guildID] = curr), acc),
                {}
            );
            // State.gameSessions =
            console.log(
                `Loaded ${Object.keys(State.gameSessions).length} game sessions`
            );
        }

        if (loadedListeningSessionData) {
            State.listeningSessions = JSON.parse(loadedListeningSessionData);
            console.log(
                `Loaded ${
                    Object.keys(State.listeningSessions).length
                } listening sessions`
            );
        }
    }
}
