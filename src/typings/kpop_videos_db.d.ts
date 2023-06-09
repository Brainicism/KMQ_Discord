import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export interface AppKpop {
    id: number;
    is_audio: Generated<"n" | "y">;
    id_parent: Generated<number | null>;
    id_better_audio: Generated<number | null>;
    name: Generated<string>;
    kname: Generated<string>;
    original_name: Generated<string>;
    alias: Generated<string>;
    vtype: Generated<"alternate" | "duplicate" | "main">;
    tags: Generated<string>;
    vlink: Generated<string>;
    id_artist: number;
    id_original_artist: number;
    releasedate: Date;
    publishedon: Date;
    views: Generated<number>;
    likes: Generated<number>;
    awards: Generated<number>;
    has_pak: Generated<"n" | "y">;
}

export interface AppKpopAgrelation {
    id_artist: number;
    id_subgroup: number;
    startyear: number;
    endyear: number;
    roles: Generated<string>;
}

export interface AppKpopCompany {
    id: number;
    name: string;
}

export interface AppKpopGaondigi {
    year: number;
    week: number;
    ranklist: string;
    aranklist: string;
}

export interface AppKpopGroup {
    id: number;
    is_collab: Generated<"n" | "y">;
    name: string;
    kname: Generated<string | null>;
    previous_name: Generated<string>;
    previous_kname: Generated<string>;
    fname: Generated<string>;
    alias: Generated<string>;
    id_company: Generated<number>;
    members: "coed" | "female" | "male";
    issolo: Generated<"n" | "y">;
    id_parentgroup: Generated<number>;
    formation: Generated<number | null>;
    disband: Generated<string>;
    fanclub: Generated<string | null>;
    id_debut: Generated<number | null>;
    debut_date: Generated<Date | null>;
    date_birth: Generated<Date | null>;
    is_deceased: Generated<"n" | "y">;
    id_country: Generated<number>;
    sales: Generated<number>;
    gaondigital_times: Generated<number>;
    gaondigital_firsts: Generated<number>;
    yawards_total: Generated<number>;
    social: Generated<string>;
    original_name: Generated<string | null>;
}

export interface AppKpopMs {
    musicshow:
        | "countdown"
        | "inkigayo"
        | "musicbank"
        | "musiccore"
        | "showchampion"
        | "theshow";
    id_artist: number;
    date: Date;
    musicname: Generated<string>;
    id_musicvideo: Generated<number>;
}

export interface AppUpcoming {
    id: number;
    id_artist: number;
    rdate: Date;
    rtype: "album" | "ep" | "single" | "undefined";
    name: Generated<string>;
}

export interface KpopVideosDB {
    app_kpop: AppKpop;
    app_kpop_agrelation: AppKpopAgrelation;
    app_kpop_company: AppKpopCompany;
    app_kpop_gaondigi: AppKpopGaondigi;
    app_kpop_group: AppKpopGroup;
    app_kpop_ms: AppKpopMs;
    app_upcoming: AppUpcoming;
}
