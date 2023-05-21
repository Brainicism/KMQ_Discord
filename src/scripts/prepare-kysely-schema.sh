#!/bin/bash
check_environment_variables() {
  if [[ -z "$DB_USER" || -z "$DB_PASS" || -z "$DB_HOST" || -z "$DB_PORT" ]]; then
    echo "Error: Required environment variables are missing."
    exit 1
  fi
}

generate_database_type() {
  OUT_FILE=./node_modules/kysely-codegen/dist/$2
  DATABASE_URL=mysql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$1 npx kysely-codegen --dialect mysql --out-file $OUT_FILE

  sed -i "s/export interface DB/export interface $3/" $OUT_FILE

  grep -qxF "export * from './$2';" ./node_modules/kysely-codegen/dist/index.d.ts || echo "export * from './$2';" >> ./node_modules/kysely-codegen/dist/index.d.ts
}


if [[ -f .env ]]; then
  set -o allexport
  source .env
  set +o allexport
fi

check_environment_variables

echo Creating types via code-gen
generate_database_type "kmq" "kmq_db.d.ts" "KmqDB"
generate_database_type "kpop_videos" "kpop_videos_db.d.ts" "KpopVideosDB"
generate_database_type "information_schema" "info_schema_db.d.ts" "InfoSchemaDB"
