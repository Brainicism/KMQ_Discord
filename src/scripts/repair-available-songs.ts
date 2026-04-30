/* eslint-disable no-console */
// Reload the two stored procedures that build `available_songs` and run them.
// Use when the column set on `available_songs` has drifted from the procedure
// definitions (typical after pulling code that adds a new column without a
// full reseed).
import { config } from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import { sql } from "kysely";
import dbContext from "../database_context";
import path from "path";

config({ path: path.resolve(__dirname, "../../.env") });

const execAsync = promisify(exec);

const PROCEDURES = [
    "020-generate_expected_available_songs_procedure.sql",
    "030-create_kmq_data_tables_procedure.sql",
];

async function main(): Promise<void> {
    const proceduresDir = path.resolve(
        __dirname,
        "..",
        "..",
        "sql",
        "procedures",
    );

    // Pass the password via MYSQL_PWD env var rather than -p<pass> so it
    // doesn't show up in `ps` for other users on the host.
    const mysqlEnv = { ...process.env, MYSQL_PWD: process.env.DB_PASS ?? "" };

    // eslint-disable-next-line no-await-in-loop
    for (const file of PROCEDURES) {
        const full = path.join(proceduresDir, file);
        console.log(`Loading ${file}...`);
        // eslint-disable-next-line no-await-in-loop
        await execAsync(
            `mysql --default-character-set=utf8mb4 -u ${process.env.DB_USER} -h ${process.env.DB_HOST} --port ${process.env.DB_PORT} kmq < ${full}`,
            { env: mysqlEnv },
        );
    }

    console.log("Calling GenerateExpectedAvailableSongs()...");
    await sql
        .raw("CALL GenerateExpectedAvailableSongs();")
        .execute(dbContext.kmq);

    console.log("Calling CreateKmqDataTables()...");
    await sql.raw("CALL CreateKmqDataTables();").execute(dbContext.kmq);

    const cols = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'kmq' AND TABLE_NAME = 'available_songs'
    `.execute(dbContext.kmq);

    const hasBetterAudio = cols.rows.some(
        (r) => r.COLUMN_NAME === "better_audio_link",
    );

    console.log(
        `available_songs has better_audio_link? ${hasBetterAudio ? "YES" : "NO"}`,
    );

    if (!hasBetterAudio) {
        console.error(
            "Column still missing. Likely cause: kpop_videos source DB is out of date — try `npm run seed`.",
        );
        process.exitCode = 1;
    }

    await dbContext.destroy();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
