import BaseArtistInfo from "./base_artist_info";

export default class UpcomingRelease extends BaseArtistInfo {
    name: string;
    releaseType: "album" | "ep" | "single" | "undefined";
    releaseDate: Date;

    constructor({
        name,
        artistName,
        hangulArtistName,
        releaseType,
        releaseDate,
        artistID,
    }: {
        name: string;
        artistName: string;
        hangulArtistName: string | null;
        releaseType: "album" | "ep" | "single" | "undefined";
        releaseDate: Date;
        artistID: number;
    }) {
        super({ artistName, hangulArtistName, artistID });
        this.name = name;
        this.artistName = artistName;
        this.hangulArtistName = hangulArtistName;
        this.releaseType = releaseType;
        this.releaseDate = releaseDate;
        this.artistID = artistID;
    }
}
