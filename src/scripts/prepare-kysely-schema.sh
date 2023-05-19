# /bin/bash
echo Creating types via code-gen
KMQ_DB_SCHEMA=./node_modules/kysely-codegen/dist/kmq_db.d.ts
KPOP_DB_SCHEMA=./node_modules/kysely-codegen/dist/kpop_videos_db.d.ts
DATABASE_URL=mysql://root:kmq123@localhost/kmq npx kysely-codegen --out-file $KMQ_DB_SCHEMA
DATABASE_URL=mysql://root:kmq123@localhost/kpop_videos npx kysely-codegen --out-file $KPOP_DB_SCHEMA

echo Modifying default exported database type names
sed -i 's/export interface DB/export interface KmqDB/' $KMQ_DB_SCHEMA
sed -i 's/export interface DB/export interface KpopVideosDB/' $KPOP_DB_SCHEMA

echo Modifying index.d.ts
grep -qxF "export * from './kmq_db';" ./node_modules/kysely-codegen/dist/index.d.ts || echo "export * from './kmq_db';" >> ./node_modules/kysely-codegen/dist/index.d.ts
grep -qxF "export * from './kpop_videos_db';" ./node_modules/kysely-codegen/dist/index.d.ts || echo "export * from './kpop_videos_db';" >> ./node_modules/kysely-codegen/dist/index.d.ts
