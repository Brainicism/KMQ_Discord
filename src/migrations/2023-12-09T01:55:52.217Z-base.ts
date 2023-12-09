import { Kysely, sql } from "kysely";
import { KmqDB } from "../typings/kmq_db";

export async function up(db: Kysely<KmqDB>): Promise<void> {}

export async function down(db: Kysely<KmqDB>): Promise<void> {}
