import type { Kysely } from "kysely";

import type { KmqDB } from "../typings/kmq_db";

/**
 *
 */
export async function up(db: Kysely<KmqDB>): Promise<void> {}

/**
 *
 */
export async function down(db: Kysely<KmqDB>): Promise<void> {}
