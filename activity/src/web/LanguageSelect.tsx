import { WEB_LOCALES } from "../platform/webPlatform";
import type { Translator } from "../i18n/translator";

/**
 * Language picker for the standalone website. Overriding the language writes a
 * cookie (see setStoredLocaleOverride) so the choice sticks across reloads and
 * visits; the shell and the game both re-fetch their bundle in response.
 *
 * `value` is the *resolved* locale tag (the server may fall a picked tag back
 * to English), so the dropdown reflects what's actually rendering.
 */
export default function LanguageSelect({
    value,
    onChange,
    t,
    className,
}: {
    value: string;
    onChange: (tag: string) => void;
    t: Translator;
    className?: string;
}): JSX.Element {
    return (
        <label
            className={`kmq-language-select${className ? ` ${className}` : ""}`}
        >
            <span className="kmq-language-select-icon" aria-hidden>
                🌐
            </span>
            <select
                className="kmq-language-select-input"
                value={value}
                aria-label={t("web.language")}
                onChange={(e) => onChange(e.target.value)}
            >
                {WEB_LOCALES.map((locale) => (
                    <option key={locale.tag} value={locale.tag}>
                        {locale.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
