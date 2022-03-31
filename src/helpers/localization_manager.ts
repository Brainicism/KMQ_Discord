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
            preload: Object.values(LocaleType),
            supportedLngs: Object.values(LocaleType),
            initImmediate: false,
            saveMissing: true,
            fallbackLng: DEFAULT_LOCALE,
            interpolation: {
                escapeValue: false,
            },
            backend: {
                loadPath: "../i18n/{{lng}}.json",
            },
        });
    }

    /**
     * Translate the given phrase using locale configuration
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
        return this.internalLocalizer.t(phrase, {
            lng: getGuildLocale(guildID),
            replace,
        });
    }

    /**
     * Translate with plural condition the given phrase and count using locale configuration
     * @param guildID - The guild ID associated with the guild receiving the string
     * @param phrase - The phrase to translate
     * @param count - The number which decides whether to select singular or plural
     * @returns The translated phrase
     */
    translateN(guildID: string, phrase: string, count: number): string {
        return this.internalLocalizer.t(phrase, {
            lng: getGuildLocale(guildID),
            count,
        });
    }
}
