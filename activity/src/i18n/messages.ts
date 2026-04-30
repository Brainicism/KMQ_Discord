import Locale from "./locale";
import en from "./locales/en";
import type Strings from "./strings";

// Locale → strings bundle. Only English is shipped today; other locales fall
// back to English until per-locale bundles are added under
// `activity/src/i18n/locales/`.
const BUNDLES: Partial<Record<Locale, Strings>> = {
    [Locale.EN]: en,
};

export default function getStrings(locale: Locale): Strings {
    return BUNDLES[locale] ?? en;
}
