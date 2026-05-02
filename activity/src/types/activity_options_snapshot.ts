// Mirror of src/interfaces/activity_options_snapshot.ts. The Activity
// bundle ships independently of the bot's TS, so the enums are inlined as
// string unions to avoid a cross-tree import.

export type ActivityGender = "male" | "female" | "coed" | "alternating";
export type ActivityGuessMode = "song" | "artist" | "both";
export type ActivityMultiguess = "on" | "off";

export default interface ActivityOptionsSnapshot {
    gender: ActivityGender[];
    guessMode: ActivityGuessMode;
    multiguess: ActivityMultiguess;
    limitStart: number;
    limitEnd: number;
    beginningYear: number;
    endYear: number;
    goal: number | null;
    timer: number | null;
}
