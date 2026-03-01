import BaseArtistInfo from "./base_artist_info.js";
import LocaleType from "../enums/locale_type.js";
import type { AvailableGenders } from "../enums/option_types/gender.js";

export default class QueriedSong extends BaseArtistInfo {
    songName: string;
    cleanSongName: string;
    hangulSongName: string | null;
    youtubeLink: string;
    betterAudioLink: string | null;
    publishDate: Date;
    members: AvailableGenders;
    isSolo: string;
    views: number;
    tags: string | null;
    vtype: string;
    selectionWeight?: number;

    constructor({
        songName,
        cleanSongName,
        hangulSongName,
        artistName,
        hangulArtistName,
        youtubeLink,
        betterAudioLink,
        publishDate,
        members,
        artistID,
        isSolo,
        views,
        tags,
        vtype,
        selectionWeight,
    }: {
        songName: string;
        cleanSongName: string;
        hangulSongName: string | null;
        artistName: string;
        hangulArtistName: string | null;
        youtubeLink: string;
        betterAudioLink: string | null;
        publishDate: Date;
        members: AvailableGenders;
        artistID: number;
        isSolo: string;
        views: number;
        tags: string | null;
        vtype: string;
        selectionWeight?: number;
    }) {
        super({ artistName, hangulArtistName, artistID });
        this.songName = songName;
        this.cleanSongName = cleanSongName;
        this.artistName = artistName;
        this.hangulSongName = hangulSongName === "" ? null : hangulSongName;
        this.hangulArtistName =
            hangulArtistName === "" ? null : hangulArtistName;
        this.youtubeLink = youtubeLink;
        this.betterAudioLink = betterAudioLink;
        this.publishDate = publishDate;
        this.members = members;
        this.artistID = artistID;
        this.isSolo = isSolo;
        this.views = views;
        this.tags = tags;
        this.vtype = vtype;
        this.selectionWeight = selectionWeight;
    }

    getLocalizedSongName(locale: LocaleType): string {
        const songName = this.songName;
        if (locale !== LocaleType.KO) {
            return songName;
        }

        const hangulSongName = this.hangulSongName;

        return hangulSongName || songName;
    }
}
