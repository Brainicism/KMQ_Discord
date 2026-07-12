export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "kmq:theme";

/**
 * @returns the stored theme choice, falling back to dark (Discord's client
 * defaults to dark; matching it is the better first impression for most
 * users)
 */
export function readInitialTheme(): Theme {
    // localStorage can throw in sandboxed contexts (rare inside Discord's
    // iframe but not impossible). Fall back to the OS preference.
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "dark" || stored === "light") return stored;
    } catch {
        // ignore
    }

    // Discord's client defaults to dark; matching it is the better first
    // impression for most users.
    if (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
        return "dark";
    }

    return "dark";
}

/**
 * Stamp the theme onto <html> so the CSS palette applies. Called once at
 * bootstrap (before React renders — the landing page has no other theme
 * owner) and again by App whenever the user toggles.
 * @param theme - the theme to apply
 */
export function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute("data-theme", theme);
}
