import * as fs from "fs";
import * as path from "path";
import { Databases, QueriedSong } from "types";

export function isDebugMode(): boolean {
    const developmentBuild = process.env.NODE_ENV === "development";
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

export async function getForcePlaySong(db: Databases): Promise<QueriedSong> {
    if (!isDebugMode()) return null;
    const forcePlaySongId = readDebugSettings("forcedSongId");
    const result = await db.kpopVideos("kpop_videos.app_kpop")
        .select(["nome as name", "name as artist", "vlink as youtubeLink"])
        .join("kpop_videos.app_kpop_group", function () {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id")
        })
        .where("vlink", forcePlaySongId);
    return result[0];
}

function readDebugSettings(key: string): any {
    const debugSettings = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../debug_settings.json")).toString());
    return debugSettings[key];
}
