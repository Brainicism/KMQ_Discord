import { Kysely } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {
    await db.schema
        .createTable("admins")
        .addColumn("user_id", "varchar(100)", (col) =>
            col.notNull().primaryKey(),
        )
        .execute();
}

export async function down(db: Kysely<KmqDB>): Promise<void> {
    await db.schema.dropTable("admins").execute();
}
