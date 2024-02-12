# !/bin/bash

pushd $(git rev-parse --show-toplevel)
cp i18n/en.json i18n/en-latest.json
git checkout origin/master -- i18n/en.json
if ! diff i18n/en-latest.json i18n/en.json; then
    echo "Updating translations..."
    npx i18n-ai-translate diff -b i18n/en.json -a i18n/en-latest.json -l "English" --verbose
else
    echo "No changes to translations"
fi
mv i18n/en-latest.json i18n/en.json
popd
