# !/bin/bash
current_branch=$(git rev-parse --abbrev-ref HEAD)
merge_base=$(git merge-base $current_branch master)

pushd $(git rev-parse --show-toplevel)
cp i18n/en.json i18n/en-latest.json
git checkout $merge_base -- i18n/en.json
if ! diff i18n/en-latest.json i18n/en.json; then
    echo "Updating translations..."
    npx i18n-ai-translate diff -b i18n/en.json -a i18n/en-latest.json -l "English" --verbose --engine chatgpt --model gpt-4-turbo-preview
else
    echo "No changes to translations"
fi
mv i18n/en-latest.json i18n/en.json
popd
