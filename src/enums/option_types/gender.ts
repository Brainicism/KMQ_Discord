export const availableGenders = [
    "male",
    "female",
    "coed",
    "alternating",
] as const;

export type AvailableGenders = (typeof availableGenders)[number];
