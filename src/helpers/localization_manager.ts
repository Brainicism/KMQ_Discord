import { I18n, TranslateOptions, Replacements, PluralOptions } from "i18n";
import path from "path";
import { IPCLogger } from "../logger";
import { state } from "../kmq_worker";

const logger = new IPCLogger("localization_manager");

export enum LocaleType {
    EN = "en",
    KR = "ko",
}

export const DEFAULT_LOCALE = LocaleType.EN;

export default class LocalizationManager {
    internalLocalizer: I18n;
    constructor() {
        this.internalLocalizer = new I18n();
        this.internalLocalizer.configure({
            locales: Object.values(LocaleType),
            defaultLocale: LocaleType.EN,
            directory: path.join(__dirname, "../../locales"),
            autoReload: true,
            updateFiles: true,
            syncFiles: true,
            prefix: "kmq-",

            logDebugFn: (_msg) => {},

            logWarnFn: (msg) => {
                logger.warn(msg);
            },

            logErrorFn: (msg) => {
                logger.error(msg);
            },
        });
    }

    /**
     * Translate the given phrase using locale configuration
     * @param guildID - The guild ID associated with the guild receiving the string
     * @param phraseOrOptions - The phrase to translate or options for translation
     * @returns The translated phrase
     */
    translate(guildID: string, phraseOrOptions: string | TranslateOptions, replace: string[] | Replacements = {}): string {
        if (phraseOrOptions instanceof Object) {
            phraseOrOptions.locale = state.locales[guildID] ?? DEFAULT_LOCALE;
        } else {
            phraseOrOptions = {
                phrase: phraseOrOptions,
                locale: state.locales[guildID] ?? DEFAULT_LOCALE,
            }
        }

        if (replace instanceof Array) {
            // eslint-disable-next-line no-underscore-dangle
            return this.internalLocalizer.__(phraseOrOptions, ...replace);
        }

        // eslint-disable-next-line no-underscore-dangle
        return this.internalLocalizer.__(phraseOrOptions, replace);
    }

    /**
     * Translate with plural condition the given phrase and count using locale configuration
     * @param guildID - The guild ID associated with the guild receiving the string
     * @param phrase - Short phrase to be translated. All plural options ("one", "few", other", ...) have to be provided by your translation file
     * @param count - The number which decides whether to select singular or plural
     * @returns The translated phrase
     */
    translateN(guildID: string, phraseOrOptions: string | PluralOptions, count: number): string {
        if (phraseOrOptions instanceof Object) {
            phraseOrOptions.locale = state.locales[guildID] ?? DEFAULT_LOCALE;
            // eslint-disable-next-line no-underscore-dangle
            return this.internalLocalizer.__n(phraseOrOptions, count);
        }

            phraseOrOptions = {
                singular: phraseOrOptions,
                plural: phraseOrOptions,
                count,
                locale: state.locales[guildID] ?? DEFAULT_LOCALE,
            }

            // eslint-disable-next-line no-underscore-dangle
            return this.internalLocalizer.__n(phraseOrOptions, count);

    }
}
