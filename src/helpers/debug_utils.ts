import fs from "fs";
import path from "path";
import { EnvType, QueriedSong } from "../types";
import dbContext from "../database_context";

const DEBUG_SETTINGS_PATH = path.resolve(__dirname, "../config/debug_settings.json");
function readDebugSettings(key: string): any {
    const debugSettings = JSON.parse(fs.readFileSync(DEBUG_SETTINGS_PATH).toString());
    return debugSettings[key];
}

export function isDebugMode(): boolean {
    const developmentBuild = process.env.NODE_ENV === EnvType.DEV && fs.existsSync(DEBUG_SETTINGS_PATH);
    if (!developmentBuild) return false;
    return readDebugSettings("active");
}

export function isForcedSongActive(): boolean {
    if (!isDebugMode()) return null;
    return readDebugSettings("forcedSongId") !== null;
}

export function skipSongPlay(): boolean {
    if (!isDebugMode()) return null;
    return readDebugSettings("skipSongPlay");
}

export async function getForcePlaySong(): Promise<QueriedSong> {
    if (!isDebugMode()) return null;
    const forcePlaySongId = readDebugSettings("forcedSongId");
    const result = await dbContext.kpopVideos("kpop_videos.app_kpop")
        .select(["nome as name", "name as artist", "vlink as youtubeLink"])
        .join("kpop_videos.app_kpop_group", function join() {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id");
        })
        .where("vlink", forcePlaySongId);
    return result[0];
}
