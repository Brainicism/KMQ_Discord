import LocaleType from "../enums/locale_type.js";

export default class BaseArtistInfo {
    artistName: string;
    hangulArtistName: string | null;
    artistID: number;

    constructor({
        artistName,
        hangulArtistName,
        artistID,
    }: {
        artistName: string;
        hangulArtistName: string | null;
        artistID: number;
    }) {
        this.artistName = artistName;
        this.hangulArtistName = hangulArtistName;
        this.artistID = artistID;
    }

    getLocalizedArtistName(locale: LocaleType): string {
        if (locale !== LocaleType.KO) {
            return this.artistName;
        }

        return this.hangulArtistName || this.artistName;
    }
}
