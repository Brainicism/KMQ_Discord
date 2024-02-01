import type { ColumnType } from "kysely";

export type Generated<T> =
    T extends ColumnType<infer S, infer I, infer U>
        ? ColumnType<S, I | undefined, U>
        : ColumnType<T, T | undefined, T>;

export interface AppKpop {
    alias: Generated<string>;
    awards: Generated<number>;
    has_pak: Generated<"n" | "y">;
    id: number;
    id_artist: number;
    id_better_audio: Generated<number | null>;
    id_original_artist: number;
    id_parent: Generated<number | null>;
    is_audio: Generated<"n" | "y">;
    kname: Generated<string>;
    likes: Generated<number>;
    name: Generated<string>;
    original_name: Generated<string>;
    promotedcharted: number;
    promotedviews_yc: Generated<number>;
    promotedweeks: number;
    publishedon: Date;
    recentlikes: Generated<number>;
    recentviews: Generated<number>;
    regionlocked: Generated<string>;
    releasedate: Date;
    tags: Generated<string>;
    viewhistory: string;
    views: Generated<number>;
    vlink: Generated<string>;
    vtype: Generated<"alternate" | "duplicate" | "main">;
}

export interface AppKpopAgrelation {
    endyear: number;
    id_artist: number;
    id_subgroup: number;
    roles: Generated<string>;
    startyear: number;
}

export interface AppKpopAlbums {
    id: number;
    id_artist: number;
    id_titletrack: number;
    name: string;
    releaseday: number;
    releasemonth: number;
    releaseyear: number;
}

export interface AppKpopCompany {
    id: number;
    id_company: number;
    name: string;
}

export interface AppKpopGaondigi {
    aranklist: string;
    ranklist: string;
    week: number;
    year: number;
}

export interface AppKpopGroup {
    alias: Generated<string>;
    date_birth: Generated<Date | null>;
    debut_date: Generated<Date | null>;
    disband: Generated<string>;
    fanclub: Generated<string | null>;
    fname: Generated<string>;
    formation: Generated<number | null>;
    gaondigital_firsts: Generated<number>;
    gaondigital_times: Generated<number>;
    has_songs: Generated<number | null>;
    id: number;
    id_company: Generated<number>;
    id_country: Generated<number>;
    id_debut: Generated<number | null>;
    id_parentgroup: Generated<number>;
    is_collab: Generated<"n" | "y">;
    is_deceased: Generated<"n" | "y">;
    issolo: Generated<"n" | "y">;
    kname: Generated<string | null>;
    members: "coed" | "female" | "male";
    mslevel: Generated<number>;
    name: string;
    original_name: Generated<string | null>;
    previous_kname: Generated<string>;
    previous_name: Generated<string>;
    sales: Generated<number>;
    social: Generated<string>;
    yawards_total: Generated<number>;
}

export interface AppKpopMs {
    date: Date;
    id_artist: number;
    id_musicvideo: Generated<number>;
    musicname: Generated<string>;
    musicshow:
        | "countdown"
        | "inkigayo"
        | "musicbank"
        | "musiccore"
        | "showchampion"
        | "theshow";
}

export interface AppUpcoming {
    id: number;
    id_artist: number;
    name: Generated<string>;
    rdate: Date;
    rtype: "album" | "ep" | "single" | "undefined";
}

export interface KpopVideosDB {
    app_kpop: AppKpop;
    app_kpop_agrelation: AppKpopAgrelation;
    app_kpop_albums: AppKpopAlbums;
    app_kpop_company: AppKpopCompany;
    app_kpop_gaondigi: AppKpopGaondigi;
    app_kpop_group: AppKpopGroup;
    app_kpop_ms: AppKpopMs;
    app_upcoming: AppUpcoming;
}
