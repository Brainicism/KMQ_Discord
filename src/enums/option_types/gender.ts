export const availableGenders = [
    "male",
    "female",
    "coed",
    "alternating",
] as const;

export type GenderModeOptions = (typeof availableGenders)[number];
export type AvailableGenders = Exclude<GenderModeOptions, "alternating">;
