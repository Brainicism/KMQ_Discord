import { DEFAULT_LOCALE } from "../constants";
import { IPCLogger } from "../logger";
import Backend from "i18next-fs-backend";
import EnvType from "../enums/env_type";
import LocaleType from "../enums/locale_type";
import State from "../state";
import i18next from "i18next";
import path from "path";

const logger = new IPCLogger("localization_manager");

export class LocalizationManager {
    internalLocalizer: typeof i18next;

    constructor() {
        this.internalLocalizer = i18next.createInstance().use(Backend);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
     * @param localeOrGuildID - A locale to translate to, or the guild ID to translate for
     * @param phrase - The phrase to translate
     * @param replace - Replacements to be applied to the phrase
     * @returns The translated phrase
     */
    translate(
        localeOrGuildID: LocaleType | string,
        phrase: string,
        replace: { [key: string]: string } = {},
    ): string {
        if (!this.hasKey(phrase)) {
            logger.error(`Missing translation for phrase: ${phrase}`);
            if (process.env.NODE_ENV === EnvType.TEST) {
                process.exit(1);
            }
        }

        return this.translateByLocale(
            Object.values(LocaleType).includes(localeOrGuildID as LocaleType)
                ? (localeOrGuildID as LocaleType)
                : State.getGuildLocale(localeOrGuildID),
            phrase,
            replace,
        );
    }

    /**
     * Wrapper for translateNByLocale
     * @param localeOrGuildID - A locale to translate to, or the guild ID to translate for
     * @param phrase - The phrase to translate
     * @param count - The number which decides whether to select singular or plural
     * @param replace - Replacements to be applied to the phrase
     * @returns The translated phrase
     */
    translateN(
        localeOrGuildID: string,
        phrase: string,
        count: number,
        replace: { [key: string]: string } | undefined = undefined,
    ): string {
        if (!this.hasKey(`${phrase}_one`) || !this.hasKey(`${phrase}_other`)) {
            logger.error(`Missing translation for plural phrase: ${phrase}`);
        }

        return this.translateNByLocale(
            localeOrGuildID in LocaleType
                ? (localeOrGuildID as LocaleType)
                : State.getGuildLocale(localeOrGuildID),
            phrase,
            count,
            replace,
        );
    }

    hasKey(key: string): boolean {
        return this.internalLocalizer.exists(key);
    }

    /**
     * Translate the given phrase using locale configuration
     * @param locale - The locale to translate to
     * @param phrase - The phrase to translate
     * @param replace - Replacements to be applied to the phrase
     * @returns The translated phrase
     */
    private translateByLocale(
        locale: LocaleType,
        phrase: string,
        replace: { [key: string]: string } = {},
    ): string {
        return this.internalLocalizer.t(phrase, {
            lng: locale,
            replace,
        });
    }

    /**
     * Translate with plural condition the given phrase and count using locale configuration
     * @param locale - The locale to translate to
     * @param phrase - The phrase to translate
     * @param count - The number which decides whether to select singular or plural
     * @param replace - Replacements to be applied to the phrase
     * @returns The translated phrase
     */
    private translateNByLocale(
        locale: LocaleType,
        phrase: string,
        count: number,
        replace: { [key: string]: string } | undefined = undefined,
    ): string {
        return this.internalLocalizer.t(phrase, {
            lng: locale,
            count,
            replace,
        });
    }
}

export default new LocalizationManager();
