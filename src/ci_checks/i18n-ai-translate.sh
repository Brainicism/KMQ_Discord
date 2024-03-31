# !/bin/bash
use_last_commit=$1
current_branch=$(git rev-parse HEAD)
merge_base=""

if [ -z "$use_last_commit" ]; then
    echo "Checking out the latest commit on master"
    merge_base=$(git merge-base $current_branch master)
else
    echo "Checking out the last commit on the current branch"
    merge_base=$(git rev-parse HEAD~)
fi

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
