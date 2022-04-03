import i18next from "i18next";
import Backend from "i18next-fs-backend";

import { getGuildLocale } from "./discord_utils";

export enum LocaleType {
    EN = "en",
    KO = "ko",
}

export const DEFAULT_LOCALE = LocaleType.EN;

export default class LocalizationManager {
    internalLocalizer: typeof i18next;
    constructor() {
        this.internalLocalizer = i18next.createInstance().use(Backend);
        this.internalLocalizer.init({
            backend: {
                loadPath: "../i18n/{{lng}}.json",
            },
            fallbackLng: DEFAULT_LOCALE,
            initImmediate: false,
            interpolation: {
                escapeValue: false,
            },
            preload: Object.values(LocaleType),
            saveMissing: true,
            supportedLngs: Object.values(LocaleType),
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
        return this.translateByLocale(getGuildLocale(guildID), phrase, replace);
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
        return this.translateNByLocale(getGuildLocale(guildID), phrase, count);
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
            count,
            lng: locale,
        });
    }
}
