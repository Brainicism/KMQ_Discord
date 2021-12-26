import { I18n, TranslateOptions, Replacements, PluralOptions } from "i18n";
import path from "path";
import { IPCLogger } from "../logger";
import { state } from "../kmq_worker";

const logger = new IPCLogger("localization_manager");

export enum LocaleType {
    EN = "en",
    KR = "kr",
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
     * @param phraseOrOptions - The phrase to translate or options for translation
     * @returns The translated phrase
     */
    translate(guildID: string, phraseOrOptions: string | TranslateOptions, replace: string[] | Replacements = {}): string {
        if (phraseOrOptions instanceof Object) {
            phraseOrOptions.locale = state.locales[guildID] ?? LocaleType.EN;
        } else {
            phraseOrOptions = {
                phrase: phraseOrOptions,
                locale: state.locales[guildID] ?? LocaleType.EN,
            }
        }

        if (replace instanceof Array) {
            return this.internalLocalizer.__(phraseOrOptions, ...replace);
        }

        return this.internalLocalizer.__(phraseOrOptions, replace);
    }

    /**
     * Translate with plural condition the given phrase and count using locale configuration
     * @param phrase - Short phrase to be translated. All plural options ("one", "few", other", ...) have to be provided by your translation file
     * @param count - The number which allow to select from plural to singular
     * @returns The translated phrase
     */
    translateN(guildID: string, phraseOrOptions: string | PluralOptions, count: number): string {
        if (phraseOrOptions instanceof Object) {
            phraseOrOptions.locale = state.locales[guildID] ?? LocaleType.EN;
            return this.internalLocalizer.__n(phraseOrOptions, count);
        }

            phraseOrOptions = {
                singular: phraseOrOptions,
                plural: phraseOrOptions,
                count,
                locale: state.locales[guildID] ?? LocaleType.EN,
            }
            return this.internalLocalizer.__n(phraseOrOptions, count);

    }
}
