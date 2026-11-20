/**
 * SeedPipeline — Orchestrates the full seed and download pipeline.
 *
 * Phases:
 *   1. Pull      — Download + extract Daisuki SQL dump
 *   2. Validate  — Import to staging DB, run checks
 *   3. Import    — Atomic swap staging → kpop_videos
 *   4. Transform — Build expected_available_songs (idempotent)
 *   5. Download  — Fetch + encode audio files
 *   6. Publish   — Build available_songs + app_kpop_group_safe
 *   7. Cleanup   — Prune old dumps, drop temp databases
 *
 * Each phase is designed to be individually re-runnable. If the pipeline
 * crashes at any point, re-running it will pick up where it left off
 * without corrupting data.
 */

export { pull } from "./phases/pull";
export { validate } from "./phases/validate";
export { importStagingToLive } from "./phases/import_db";
export { transform } from "./phases/transform";
export { publish } from "./phases/publish";
export { cleanup } from "./phases/cleanup";
