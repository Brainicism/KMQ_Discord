import Locale from "./locale";

const SUPPORTED: ReadonlySet<string> = new Set(Object.values(Locale));

// Maps a raw Discord locale tag (returned by `users.@me.locale` or
// `userSettingsGetLocale`) onto a KMQ-supported `Locale`. Discord uses BCP-47
// ish tags ("en-US", "pt-BR", "zh-CN"); KMQ supports a subset, so we match
// exact, then language-prefix, then fall back to English.
export default function resolveLocale(raw: string | null | undefined): Locale {
    if (!raw) return Locale.EN;

    if (SUPPORTED.has(raw)) {
        return raw as Locale;
    }

    const language = raw.split("-")[0]?.toLowerCase();
    if (!language) return Locale.EN;

    if (SUPPORTED.has(language)) {
        return language as Locale;
    }

    // Discord uses "es-ES" / "pt-BR" / "zh-CN"; map any "es-*" / "pt-*" / "zh-*"
    // user picked something close — to the canonical KMQ tag.
    for (const supported of SUPPORTED) {
        if (supported.split("-")[0] === language) {
            return supported as Locale;
        }
    }

    return Locale.EN;
}
