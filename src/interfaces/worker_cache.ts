import type LocaleType from "../enums/locale_type";
import type MatchedArtist from "./matched_artist";

export type ArtistAliasCache = { [artistName: string]: Array<string> };
export type SongAliasCache = { [songLink: string]: Array<string> };
export type ArtistCache = { [artistNameOrAlias: string]: MatchedArtist };
export type TopArtistCache = Array<MatchedArtist>;
export type BonusGroupCache = Set<string>;
export type LocaleCache = { [guildID: string]: LocaleType };
export type SongCache = {
    [songLink: string]: {
        name: string;
        hangulName: string | null;
        artistID: number;
    };
};
export type NewSongCache = Array<{
    songLink: string;
    name: string;
    hangulName?: string;
    artistID: number;
}>;
export type BannedPlayerCache = Set<string>;
export type BannedServerCache = Set<string>;

export default interface WorkerCache {
    artistAliases: ArtistAliasCache;
    songAliases: SongAliasCache;
    artists: ArtistCache;
    topArtists: TopArtistCache;
    bonusGroups: BonusGroupCache;
    locales: LocaleCache;
    songs: SongCache;
    newSongs: NewSongCache;
    bannedPlayers: BannedPlayerCache;
    bannedServers: BannedServerCache;
}
