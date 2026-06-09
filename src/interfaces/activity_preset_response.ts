/** Why a preset operation was rejected. Maps to client-side messages. */
type ActivityPresetRejectReason =
    | "no_name"
    | "name_too_long"
    | "illegal_prefix"
    | "too_many"
    | "exists"
    | "not_found"
    | "not_in_vc"
    | "banned"
    | "internal";

/**
 * Reply to a "preset" IPC op. Every success carries the current preset list
 * so the client can refresh without a second round-trip.
 */
type ActivityPresetResponse =
    | { ok: true; presets: string[] }
    | { ok: false; reason: ActivityPresetRejectReason };

export default ActivityPresetResponse;
