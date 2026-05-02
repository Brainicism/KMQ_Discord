// Minimal i18next-style translator: the server ships a flat
// `{ key: "text with {{var}}" }` bundle (already merged with the English
// fallback) and this file applies runtime substitutions. No dependency on
// i18next on the client.

export type TranslationVars = Record<string, string | number>;

export type Translator = (key: string, vars?: TranslationVars) => string;

const INTERP = /\{\{\s*(\w+)\s*\}\}/g;

export function makeTranslator(strings: Record<string, string>): Translator {
    return (key, vars) => {
        const raw = strings[key];
        if (raw === undefined) return key;
        if (!vars) return raw;
        return raw.replace(INTERP, (match, name: string) => {
            const value = vars[name];
            return value === undefined ? match : String(value);
        });
    };
}
