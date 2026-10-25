import { DEFAULT_LOCALE } from "../constants";
import LocaleType from "../enums/locale_type";

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set(
    Object.values(LocaleType),
);

/**
 * Normalizes a raw locale tag from an Activity client into a KMQ-supported
 * `LocaleType`. Discord hands back BCP-47-ish tags ("en-US", "pt-BR") while
 * KMQ only supports a subset, so we match exact, then the language prefix,
 * then fall back to English.
 * @param raw - unverified locale tag from the client
 * @returns a supported `LocaleType`
 */
export function resolveServerLocale(raw: string | undefined): LocaleType {
    if (!raw) return DEFAULT_LOCALE;

    if (SUPPORTED_LOCALES.has(raw)) {
        return raw as LocaleType;
    }

    const language = raw.split("-")[0]?.toLowerCase();
    if (!language) return DEFAULT_LOCALE;

    if (SUPPORTED_LOCALES.has(language)) {
        return language as LocaleType;
    }

    for (const supported of SUPPORTED_LOCALES) {
        if (supported.split("-")[0] === language) {
            return supported as LocaleType;
        }
    }

    return DEFAULT_LOCALE;
}

/**
 * The public origin this deployment is reachable at. Used for the OAuth
 * redirect URI, and for the crawler-facing bits of the website (canonical
 * URL, link-preview tags, robots.txt, sitemap). Falls back to the Activity
 * tunnel URL so a dev setup configured only for the Activity works too.
 * @returns the origin with trailing slashes stripped, or null if unconfigured
 */
export function siteOrigin(): string | null {
    const base =
        process.env.WEB_PUBLIC_BASE_URL || process.env.ACTIVITY_PUBLIC_BASE_URL;

    return base ? base.replace(/\/+$/, "") : null;
}
