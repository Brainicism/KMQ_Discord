#!/bin/bash
# Translates en.json keys that changed since master (or HEAD~ with an arg)
# into every other locale. Defaults to Claude (reads ANTHROPIC_API_KEY);
# override with I18N_TRANSLATE_ENGINE / I18N_TRANSLATE_MODEL, e.g.
# I18N_TRANSLATE_ENGINE=chatgpt I18N_TRANSLATE_MODEL=gpt-5.2 (OPENAI_API_KEY).
set -eo pipefail

use_last_commit=$1
current_branch=$(git rev-parse HEAD)
merge_base=""
engine="${I18N_TRANSLATE_ENGINE:-claude}"
if [ "$engine" = "claude" ]; then
    default_model="claude-sonnet-5-5"
else
    default_model="gpt-5.2"
fi
model="${I18N_TRANSLATE_MODEL:-$default_model}"

if [ -z "$use_last_commit" ]; then
    echo "Checking out the latest commit on master"
    merge_base=$(git merge-base $current_branch master)
else
    echo "Checking out the last commit on the current branch"
    merge_base=$(git rev-parse HEAD~)
fi

root=$(git rev-parse --show-toplevel)
pushd "$root"
cp i18n/en.json i18n/en-latest.json
# Always put the edited en.json back, even if translation fails midway
trap 'mv "$root/i18n/en-latest.json" "$root/i18n/en.json"' EXIT
git checkout $merge_base -- i18n/en.json
if ! diff i18n/en-latest.json i18n/en.json; then
    echo "Updating translations with $engine/$model..."
    # Stop at the first key that exhausts retries (e.g. a dead model or no
    # quota) instead of grinding through every key
    npx i18n-ai-translate diff \
        -b i18n/en.json \
        -a i18n/en-latest.json \
        -l "English" \
        --verbose \
        --engine "$engine" \
        --model "$model" \
        --no-continue-on-error \
        --skip-translation-verification \
        --context "a K-pop music trivia game played through a Discord bot"
else
    echo "No changes to translations"
fi
popd

# The tool can log per-locale failures and still exit 0, so verify the
# outcome: every locale must now have the same keys as en.json
mv "$root/i18n/en-latest.json" "$root/i18n/en.json"
trap - EXIT
if ! (cd "$root" && npm run --silent lint-i18n-ci >/dev/null); then
    echo "Translation incomplete: some locales are missing keys (run 'npm run lint-i18n' for details)" >&2
    exit 1
fi
