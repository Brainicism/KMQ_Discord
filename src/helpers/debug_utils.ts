import fs from "fs";
import path from "path";
import { EnvType, QueriedSong } from "../types";
import dbContext from "../database_context";

const DEBUG_SETTINGS_PATH = path.resolve(__dirname, "../config/debug_settings.json");

/**
 * @param key - The key of the setting in the debug file
 * @returns the value of a specific option from the debug file
 */
function readDebugSettings(key: string): any {
    const debugSettings = JSON.parse(fs.readFileSync(DEBUG_SETTINGS_PATH).toString());
    return debugSettings[key];
}

/** @returns whether KMQ is running in debug mode */
export function isDebugMode(): boolean {
    const developmentBuild = process.env.NODE_ENV === EnvType.DEV && fs.existsSync(DEBUG_SETTINGS_PATH);
    if (!developmentBuild) return false;
    return readDebugSettings("active");
}

/** @returns whether 'forcedSongID' debug option is active */
export function isForcedSongActive(): boolean {
    if (!isDebugMode()) return null;
    return readDebugSettings("forcedSongID") !== null;
}

/** @returns whether 'skipSongPlay' debug option is active */
export function skipSongPlay(): boolean {
    if (!isDebugMode()) return null;
    return readDebugSettings("skipSongPlay");
}

/** @returns the QueriedSong corresponding to the 'forcedSongID' option */
export async function getForcePlaySong(): Promise<QueriedSong> {
    if (!isDebugMode()) return null;
    const forcePlaySongID = readDebugSettings("forcedSongID");
    const result = await dbContext.kpopVideos("kpop_videos.app_kpop")
        .select(["app_kpop.name as name", "app_kpop_group.name as artist", "vlink as youtubeLink"])
        .join("kpop_videos.app_kpop_group", function join() {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id");
        })
        .where("vlink", forcePlaySongID);
    return result[0];
}
