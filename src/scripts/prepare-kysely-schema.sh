#!/bin/bash

check_environment_variables() {
    if [[ -z "$DB_USER" || -z "$DB_PASS" || -z "$DB_HOST" || -z "$DB_PORT" ]]; then
        echo "Error: Required environment variables are missing"
        exit 1
    fi
}

generate_database_type() {
    OUT_FILE=./node_modules/kysely-codegen/dist/$2
    DATABASE_URL=mysql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$1 npx kysely-codegen --dialect mysql --out-file $OUT_FILE
    sed -i "s/export interface DB/export interface $3/" $OUT_FILE
    grep -qxF "export * from './$2';" ./node_modules/kysely-codegen/dist/index.d.ts || echo "export * from './$2';" >> ./node_modules/kysely-codegen/dist/index.d.ts
    cp $OUT_FILE src/typings
}

copy_cached_database_type() {
    OUT_FILE=./node_modules/kysely-codegen/dist/$1
    cp -rv ./src/typings/$1 ./node_modules/kysely-codegen/dist/
    grep -qxF "export * from './$1';" ./node_modules/kysely-codegen/dist/index.d.ts || echo "export * from './$1';" >> ./node_modules/kysely-codegen/dist/index.d.ts
}

merge_schemas() {
    source_file="./node_modules/kysely-codegen/dist/kpop_videos_db.d.ts"
    destination_file="./node_modules/kysely-codegen/dist/kmq_db.d.ts"
    interface_properties=$(sed -n '/export interface KpopVideosDB {/,/}/p' "$source_file" | sed '1d;$d' | tr -d '\n')
    IFS=';' read -ra props <<< "$interface_properties"
    for prop in "${props[@]}"; do
        prop=$(echo "$prop" | awk '{$1=$1};1')
        IFS=':' read -ra parts <<< "$prop"
        key="kpop_videos.${parts[0]}"
        modified_prop="\"$key\": ${parts[1]}"
        interface_properties=${interface_properties//$prop/$modified_prop}
    done

    if grep -q "export interface KmqDB {" "$destination_file"; then
        sed -i.bak '/export interface KmqDB {/a\
    '"$interface_properties"'
        ' "$destination_file"
        echo "New properties added successfully."
    else
        echo "Interface 'KmqDB' not found in the file."
    fi
}

if [[ -f .env ]]; then
    set -o allexport
    source .env
    set +o allexport
fi

if [ "$CACHED" = "true" ]; then
    echo "Loading cached version from repository..."
    copy_cached_database_type "kmq_db.d.ts"
    copy_cached_database_type "kpop_videos_db.d.ts"
    copy_cached_database_type "info_schema_db.d.ts"
else
    echo Creating types via code-gen...
    check_environment_variables
    mkdir -p src/typings
    generate_database_type "kmq" "kmq_db.d.ts" "KmqDB"
    generate_database_type "kpop_videos" "kpop_videos_db.d.ts" "KpopVideosDB"
    generate_database_type "information_schema" "info_schema_db.d.ts" "InfoSchemaDB"
fi

echo Merging schemas...
merge_schemas

echo Done!
