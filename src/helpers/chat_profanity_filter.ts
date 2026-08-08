import {
    DataSet,
    RegExpMatcher,
    TextCensor,
    asteriskCensorStrategy,
    parseRawPattern,
    resolveConfusablesTransformer,
    resolveLeetSpeakTransformer,
    toAsciiLowerCaseTransformer,
} from "obscenity";
// Imported as raw JSON (the package ships no types) so no ambient declaration
// or tsconfig change is needed.
import wordListJson from "@dsojevic/profanity-list/en.json";

/**
 * One entry in the word list. `match` is a `|`-separated set of spellings where
 * an asterisk means the previous character may repeat; `exceptions` are
 * surrounding-context globs in which `*` stands in for the matched spelling.
 */
interface WordListEntry {
    id: string;
    match: string;
    tags: string[];
    severity: number;
    exceptions?: string[];
    /** Absent means true — the term may match inside a longer word. */
    allow_partial?: boolean;
}

const wordList = wordListJson as WordListEntry[];

/**
 * A deliberately lenient filter for room chat. Common profanity is left alone;
 * only the narrow set of terms outside the permitted categories is masked.
 *
 * Both the vocabulary and its categorisation come from packages, so neither is
 * written into this repo:
 *
 *  - `@dsojevic/profanity-list` supplies the terms and tags each one with a
 *    category, so the policy below is a predicate over category names rather
 *    than a word list.
 *  - `obscenity` does the matching, handling character substitution, repeated
 *    characters, and the innocent-substring false positives a naive matcher
 *    trips on.
 *
 * Severity is deliberately not the axis: the dataset's README notes that most
 * entries were given a default level before being classified, so it does not
 * track how objectionable a term actually is.
 */

/**
 * The highest severity each category is permitted up to. A category absent from
 * this map is never permitted, and anything above its ceiling is masked.
 *
 * The ceilings differ because the categories are not uniform:
 *  - one is ordinary swearing throughout, so it is permitted at every level;
 *  - one is mostly crude vocabulary but turns into material with no place in a
 *    game chat at the top of its scale;
 *  - one is mostly everyday expressions with a single entry at the top that is
 *    not an expression at all.
 */
const PERMITTED_MAX_SEVERITY: ReadonlyMap<string, number> = new Map([
    ["general", Number.POSITIVE_INFINITY],
    ["sexual", 3],
    ["religious", 2],
]);

/**
 * Whether an entry is allowed through unmasked. An entry qualifies if any of
 * its categories permits it at that entry's severity.
 * @param entry - a word-list entry
 * @returns true when the term should pass
 */
function isPermitted(entry: WordListEntry): boolean {
    return entry.tags.some((tag) => {
        const ceiling = PERMITTED_MAX_SEVERITY.get(tag);
        return ceiling !== undefined && entry.severity <= ceiling;
    });
}

/**
 * Whether an entry should be masked out of chat.
 * @param entry - a word-list entry
 * @returns true when the term is filtered
 */
function isFiltered(entry: WordListEntry): boolean {
    return !isPermitted(entry);
}

/**
 * Character-level normalizations only. obscenity's recommended bundle also
 * collapses repeated characters, which rewrites the text being checked and so
 * expects patterns pre-collapsed to match — fine for its own hand-written
 * patterns, but ours come from data and keep their natural spelling. These
 * three map characters one-for-one, so positions still line up.
 */
const transformers = [
    toAsciiLowerCaseTransformer(),
    resolveConfusablesTransformer(),
    resolveLeetSpeakTransformer(),
];

/**
 * Applies the same character normalizations that incoming text goes through.
 * Spellings that use digits are rewritten on the way in (a digit resolves to
 * the letter it imitates), so a pattern left in its raw form could never line
 * up with them. Running the pattern through the identical transformers keeps
 * the two consistent without hardcoding a substitution table here.
 * @param source - a pattern source string
 * @returns the normalized equivalent
 */
function normalizeLikeInput(source: string): string {
    let out = "";
    for (const character of source) {
        let code: number | undefined = character.codePointAt(0);
        for (const transformer of transformers) {
            if (code === undefined) break;
            code = (
                transformer as unknown as {
                    transform: (c: number) => number | undefined;
                }
            ).transform(code);
        }

        if (code !== undefined) {
            out += String.fromCodePoint(code);
        }
    }

    return out;
}

/**
 * Expands a `match` variant into obscenity pattern sources.
 *
 * The asterisk (a "previous character may repeat" marker) is dropped, since
 * repeated characters are handled separately. A multi-word spelling also gets a
 * separator-free form, and any spelling gets its input-normalized form, so it
 * matches however the text was written.
 * @param variant - one `|`-separated spelling from an entry's `match`
 * @returns the distinct pattern source strings
 */
function patternSourcesFor(variant: string): string[] {
    const literal = variant.replace(/\*/g, "");
    return [
        ...new Set([
            literal,
            literal.replace(/[^a-z0-9]/g, ""),
            normalizeLikeInput(literal),
            normalizeLikeInput(literal.replace(/[^a-z0-9]/g, "")),
        ]),
    ];
}

/**
 * Compiles the filtered entries into an obscenity dataset.
 * @returns the dataset to build a matcher from
 */
function buildDataSet(): DataSet<{ id: string }> {
    const dataset = new DataSet<{ id: string }>();

    for (const entry of wordList.filter(isFiltered)) {
        const variants = [
            ...new Set(
                entry.match
                    .split("|")
                    .flatMap(patternSourcesFor)
                    .filter((variant) => variant.length > 0),
            ),
        ];

        if (variants.length === 0) {
            continue;
        }

        dataset.addPhrase((phrase) => {
            let builder = phrase.setMetadata({ id: entry.id });

            for (const variant of variants) {
                // `allow_partial: false` marks a term that only counts as a
                // whole word, so anchor it rather than let it fire inside a
                // longer, innocent one.
                builder = builder.addPattern(
                    parseRawPattern(
                        entry.allow_partial === false
                            ? `|${variant}|`
                            : variant,
                    ),
                );
            }

            // An exception is a context the term appears in harmlessly, with
            // `*` standing in for the term itself. Whitelisting it suppresses
            // the match there.
            const spellings = new Set(variants);
            for (const exception of entry.exceptions ?? []) {
                for (const variant of variants) {
                    const expanded = exception.replace(/\*/g, variant);

                    // An exception can expand into another spelling of the same
                    // entry (a plural, say), which would whitelist the term
                    // itself and let it through. Never do that.
                    if (spellings.has(expanded)) {
                        continue;
                    }

                    builder = builder.addWhitelistedTerm(expanded);
                }
            }

            return builder;
        });
    }

    return dataset;
}

const matcher = new RegExpMatcher({
    ...buildDataSet().build(),
    blacklistMatcherTransformers: transformers,
    whitelistMatcherTransformers: transformers,
});

const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/**
 * Masks filtered terms in `text` with asterisks, leaving everything else —
 * including ordinary profanity — untouched.
 * @param text - the raw chat message
 * @returns the message with filtered terms masked
 */
export default function maskProfanity(text: string): string {
    return censor.applyTo(text, matcher.getAllMatches(text));
}

/** Exposed so tests can build their fixtures from the package data. */
export { isFiltered };
export type { WordListEntry };
