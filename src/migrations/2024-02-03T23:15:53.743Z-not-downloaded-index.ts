import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("not_downloaded")
        .addIndex("not_downloaded_vlink_index")
        .column("vlink")
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .alterTable("not_downloaded")
        .dropIndex("not_downloaded_vlink_index")
        .execute();
}
