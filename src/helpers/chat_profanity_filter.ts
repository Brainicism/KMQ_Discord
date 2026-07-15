/**
 * A deliberately lenient chat filter for the web room chat. It masks only the
 * most heinous hate slurs — everyday profanity ("fuck", "shit", "ass", "bitch",
 * "damn", …) is intentionally left alone. The goal is a light guard against
 * hate speech, not a swear jar.
 *
 * Matching is whole-word (on a normalized form of each token) rather than
 * substring, which avoids the classic false positives ("Scunthorpe",
 * "assassin", "cons", …). Normalization lowercases, folds common leetspeak
 * substitutions, drops non-letters, and squashes 3+ character runs down to two
 * so light obfuscation ("n1gg3r", "coooon", "f.a.g") is still caught.
 */

// Leet / homoglyph folding for the most common substitutions.
const LEET_MAP: Readonly<Record<string, string>> = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "8": "b",
    "@": "a",
    $: "s",
    "!": "i",
};

// Stored in the same normalized form produced by `normalize` (natural spelling,
// which never has a run longer than two identical letters). Trailing-plural
// forms are handled by the matcher, so only the singular root is listed. Kept
// intentionally short and unambiguous.
const BLOCKED_ROOTS: ReadonlySet<string> = new Set([
    "nigger",
    "nigga",
    "faggot",
    "fag",
    "kike",
    "spic",
    "chink",
    "gook",
    "coon",
    "beaner",
    "wetback",
    "raghead",
    "sandnigger",
    "tranny",
    "retard",
    "retarded",
]);

/**
 * Folds a raw token into the canonical form used for matching: lowercased,
 * leet-substituted, letters-only, with runs of 3+ identical letters squashed to
 * two.
 * @param token - a single whitespace-delimited token
 * @returns the normalized token, or "" when it has no letters (punctuation,
 * emoji, numbers)
 */
function normalize(token: string): string {
    let out = "";
    for (const ch of token.toLowerCase()) {
        const mapped = LEET_MAP[ch] ?? ch;
        if (mapped >= "a" && mapped <= "z") {
            out += mapped;
        }
    }

    // Squash exaggerated runs ("coooon" → "coon") without collapsing genuine
    // double letters ("coon" stays "coon").
    return out.replace(/(.)\1{2,}/g, "$1$1");
}

/**
 * Whether a normalized token is a blocked slur (bare or simple plural).
 * @param normalized - a token already run through `normalize`
 * @returns true when the token is a blocked slur
 */
function isBlocked(normalized: string): boolean {
    if (!normalized) return false;
    if (BLOCKED_ROOTS.has(normalized)) return true;
    // Strip a trailing plural "s" ("niggers" → "nigger", "spics" → "spic").
    if (
        normalized.endsWith("s") &&
        BLOCKED_ROOTS.has(normalized.slice(0, -1))
    ) {
        return true;
    }

    return false;
}

/**
 * Replaces any blocked slur in `text` with asterisks, leaving everything else
 * (including ordinary profanity) untouched. Masked tokens keep their original
 * length so the redaction reads naturally.
 * @param text - the raw chat message
 * @returns the message with heinous words masked
 */
export default function maskProfanity(text: string): string {
    return text.replace(/\S+/g, (token) =>
        isBlocked(normalize(token)) ? "*".repeat(token.length) : token,
    );
}
