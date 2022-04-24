import i18next from "i18next";
import path from "path";
import Backend from "i18next-fs-backend";
import { LocaleType } from "../enums/locale_type";
import { DEFAULT_LOCALE } from "../constants";
import State from "../state";

export default class LocalizationManager {
    internalLocalizer: typeof i18next;
    constructor() {
        this.internalLocalizer = i18next.createInstance().use(Backend);
        this.internalLocalizer.init({
            preload: Object.values(LocaleType),
            supportedLngs: Object.values(LocaleType),
            initImmediate: false,
            saveMissing: true,
            fallbackLng: DEFAULT_LOCALE,
            interpolation: {
                escapeValue: false,
            },
            backend: {
                loadPath: path.join(__dirname, "../../i18n/{{lng}}.json"),
            },
        });
    }

    /**
     * Wrapper for translateByLocale
     * @param guildID - The guild ID associated with the guild receiving the string
     * @param phrase - The phrase to translate
     * @param replace - Replacements to be applied to the phrase
     * @returns The translated phrase
     */
    translate(
        guildID: string,
        phrase: string,
        replace: { [key: string]: string } = {}
    ): string {
        return this.translateByLocale(
            State.getGuildLocale(guildID),
            phrase,
            replace
        );
    }

    /**
     * Translate the given phrase using locale configuration
     * @param locale - The locale to translate to
     * @param phrase - The phrase to translate
     * @param replace - Replacements to be applied to the phrase
     * @returns The translated phrase
     */
    translateByLocale(
        locale: LocaleType,
        phrase: string,
        replace: { [key: string]: string } = {}
    ): string {
        return this.internalLocalizer.t(phrase, {
            lng: locale,
            replace,
        });
    }

    /**
     * Wrapper for translateNByLocale
     * @param guildID - The guild ID associated with the guild receiving the string
     * @param phrase - The phrase to translate
     * @param count - The number which decides whether to select singular or plural
     * @returns The translated phrase
     */
    translateN(guildID: string, phrase: string, count: number): string {
        return this.translateNByLocale(
            State.getGuildLocale(guildID),
            phrase,
            count
        );
    }

    /**
     * Translate with plural condition the given phrase and count using locale configuration
     * @param locale - The locale to translate to
     * @param phrase - The phrase to translate
     * @param count - The number which decides whether to select singular or plural
     * @returns The translated phrase
     */
    translateNByLocale(
        locale: LocaleType,
        phrase: string,
        count: number
    ): string {
        return this.internalLocalizer.t(phrase, {
            lng: locale,
            count,
        });
    }
}
