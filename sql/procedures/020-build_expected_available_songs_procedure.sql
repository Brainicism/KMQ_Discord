DELIMITER //
START TRANSACTION //
DROP PROCEDURE IF EXISTS BuildExpectedAvailableSongs //
CREATE PROCEDURE BuildExpectedAvailableSongs()
BEGIN
	/*
	 * BuildExpectedAvailableSongs
	 *
	 * Idempotent procedure that builds the expected_available_songs table
	 * by reading from kpop_videos.app_kpop and kpop_videos.app_kpop_group.
	 *
	 * Key design decisions:
	 *   - Source tables (app_kpop, app_kpop_group) are NEVER mutated
	 *   - better_audio_link is computed via LEFT JOIN, not ALTER+UPDATE+DELETE
	 *   - Audio-only rows used as better_audio targets are excluded via WHERE NOT IN
	 *   - Song name bracket stripping is computed in SELECT, not via UPDATE
	 *   - Artist name deduplication is computed in SELECT, not via UPDATE
	 *   - Uses atomic RENAME swap so the table is always readable
	 *
	 * Replaces: GenerateExpectedAvailableSongs + PostSeedDataCleaning
	 */

	/* Create staging table */
	DROP TABLE IF EXISTS expected_available_songs_staging;
	CREATE TABLE expected_available_songs_staging (
		song_name_en VARCHAR(255) NOT NULL,
		clean_song_name_alpha_numeric VARCHAR(255) NOT NULL,
		song_name_ko VARCHAR(255) NOT NULL,
		song_aliases VARCHAR(255) NOT NULL,
		link VARCHAR(255) NOT NULL,
		better_audio_link VARCHAR(255),
		artist_name_en VARCHAR(255) NOT NULL,
		original_artist_name_en VARCHAR(255) NOT NULL,
		artist_name_ko VARCHAR(255),
		artist_aliases VARCHAR(255) NOT NULL,
		previous_name_en VARCHAR(255),
		previous_name_ko VARCHAR(255),
		members ENUM('female','male','coed') NOT NULL,
		views BIGINT NOT NULL,
		publishedon DATE NOT NULL,
		id_artist INT(11) NOT NULL,
		issolo ENUM('y', 'n') NOT NULL,
		id_parent_artist INT(11) NOT NULL,
		vtype ENUM('main', 'audio') NOT NULL,
		tags VARCHAR(25),
		dead ENUM('y', 'n') NOT NULL,
		daisuki_id INT(11) NOT NULL
	) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

	/*
	 * Compute and insert all data from source tables.
	 *
	 * - Song name bracket stripping (was PostSeedDataCleaning):
	 *   Applied inline in the CASE expression on app_kpop.name
	 *
	 * - better_audio_link (was ALTER+UPDATE+DELETE on app_kpop):
	 *   Computed via LEFT JOIN to app_kpop self-reference
	 *
	 * - Audio-only duplicates (was DELETE from app_kpop):
	 *   Excluded via WHERE NOT IN subquery
	 *
	 * - Artist name deduplication (was PostSeedDataCleaning UPDATE):
	 *   Uses a subquery to detect duplicate names and appends (fname) suffix.
	 *   The original_artist_name_en always stores the raw name from the source.
	 */
	INSERT INTO expected_available_songs_staging
	SELECT
		/* song_name_en: strip trailing bracketed part if present */
		(CASE
			WHEN kpop_videos.app_kpop.name LIKE '%(%)' AND RIGHT(kpop_videos.app_kpop.name, 1) = ')'
			THEN TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1))
			ELSE kpop_videos.app_kpop.name
		END) AS song_name_en,

		/* clean_song_name_alpha_numeric: apply CleanSongName on the bracket-stripped version */
		(CASE
			WHEN kpop_videos.app_kpop.name REGEXP '^[^a-zA-Z0-9]+$'
			THEN kpop_videos.app_kpop.name
			WHEN kpop_videos.app_kpop.name REGEXP '\\([^)]*\\)$'
			THEN CleanSongName(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1))
			ELSE CleanSongName(kpop_videos.app_kpop.name)
		END) AS clean_song_name_alpha_numeric,

		kpop_videos.app_kpop.kname AS song_name_ko,
		kpop_videos.app_kpop.alias AS song_aliases,
		kpop_videos.app_kpop.vlink AS link,

		/* better_audio_link: computed via LEFT JOIN, not mutating app_kpop */
		better_audio_src.vlink AS better_audio_link,

		/* artist_name_en: de-duplicate by appending (fname) for colliding names */
		(CASE
			WHEN dup_names.dupe_name IS NOT NULL AND kpop_videos.app_kpop_group.fname <> ''
			THEN CONCAT(kpop_videos.app_kpop_group.name, ' (', kpop_videos.app_kpop_group.fname, ')')
			ELSE kpop_videos.app_kpop_group.name
		END) AS artist_name_en,

		kpop_videos.app_kpop_group.name AS original_artist_name_en,
		kpop_videos.app_kpop_group.kname AS artist_name_ko,
		REPLACE(kpop_videos.app_kpop_group.alias, '; ', ';') AS artist_aliases,
		kpop_videos.app_kpop_group.previous_name AS previous_name_en,
		kpop_videos.app_kpop_group.previous_kname AS previous_name_ko,
		kpop_videos.app_kpop_group.members AS members,
		kpop_videos.app_kpop.views AS views,
		kpop_videos.app_kpop.releasedate AS publishedon,
		kpop_videos.app_kpop_group.id AS id_artist,
		kpop_videos.app_kpop_group.issolo,
		kpop_videos.app_kpop_group.id_parentgroup AS id_parent_artist,
		IF(kpop_videos.app_kpop.is_audio = 'n', 'main', 'audio') AS vtype,
		kpop_videos.app_kpop.tags,
		kpop_videos.app_kpop.dead AS dead,
		kpop_videos.app_kpop.id AS daisuki_id
	FROM kpop_videos.app_kpop

	/* Join artist data */
	JOIN kpop_videos.app_kpop_group
		ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id

	/* Compute better_audio_link via self-join */
	LEFT JOIN kpop_videos.app_kpop AS better_audio_src
		ON kpop_videos.app_kpop.id_better_audio = better_audio_src.id

	/* Detect duplicate artist names for dedup (was PostSeedDataCleaning) */
	LEFT JOIN (
		SELECT LOWER(name) AS dupe_name
		FROM kpop_videos.app_kpop_group
		WHERE name NOT LIKE '%(%)%'
		GROUP BY LOWER(name)
		HAVING COUNT(*) > 1
	) AS dup_names
		ON LOWER(kpop_videos.app_kpop_group.name) = dup_names.dupe_name

	WHERE
		/* Exclude audio-only rows that serve as better_audio targets for other songs */
		kpop_videos.app_kpop.id NOT IN (
			SELECT DISTINCT id_better_audio
			FROM kpop_videos.app_kpop
			WHERE id_better_audio IS NOT NULL
		)
		/* Standard filters */
		AND kpop_videos.app_kpop.vtype = 'main'
		AND kpop_videos.app_kpop.name REGEXP '[0-9a-zA-Z[:punct:]]'
		AND kpop_videos.app_kpop.tags NOT LIKE '%c%'
		AND kpop_videos.app_kpop.tags NOT LIKE '%x%';

	/* Atomic swap: staging → live */
	CREATE TABLE IF NOT EXISTS expected_available_songs LIKE expected_available_songs_staging;
	RENAME TABLE
		expected_available_songs TO expected_available_songs_old,
		expected_available_songs_staging TO expected_available_songs;
	DROP TABLE IF EXISTS expected_available_songs_old;

END //
COMMIT //
DELIMITER ;
