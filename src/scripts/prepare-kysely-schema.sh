#!/bin/bash

generate_database_type() {
  OUT_FILE=./node_modules/kysely-codegen/dist/$2
  DATABASE_URL=mysql://root:kmq123@localhost/$1 npx kysely-codegen --out-file $OUT_FILE

  sed -i "s/export interface DB/export interface $3/" $OUT_FILE

  grep -qxF "export * from './$2';" ./node_modules/kysely-codegen/dist/index.d.ts || echo "export * from './$2';" >> ./node_modules/kysely-codegen/dist/index.d.ts
}

echo Creating types via code-gen
generate_database_type "kmq" "kmq_db.d.ts" "KmqDB"
generate_database_type "kpop_videos" "kpop_videos_db.d.ts" "KpopVideosDB"
generate_database_type "information_schema" "info_schema_db.d.ts" "InfoSchemaDB"
