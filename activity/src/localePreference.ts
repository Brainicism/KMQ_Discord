// The embedded Activity's language override. The web shell persists its own
// override in a cookie (see webPlatform), but Discord embeds the Activity in a
// cross-origin iframe where cookies are partitioned/unreliable — so, like the
// theme preference, the Activity persists to localStorage instead.

const LOCALE_OVERRIDE_STORAGE_KEY = "kmq:localeOverride";

/** Reads the Activity's saved language override, or null to follow Discord. */
export function readStoredLocaleOverride(): string | null {
    try {
        const stored = window.localStorage.getItem(LOCALE_OVERRIDE_STORAGE_KEY);

        return stored || null;
    } catch {
        return null;
    }
}

/** Persists an explicit language choice so it survives reloads. */
export function storeLocaleOverride(locale: string): void {
    try {
        window.localStorage.setItem(LOCALE_OVERRIDE_STORAGE_KEY, locale);
    } catch {
        // Storage may be unavailable (sandboxed iframe); the choice still
        // applies for this session.
    }
}
