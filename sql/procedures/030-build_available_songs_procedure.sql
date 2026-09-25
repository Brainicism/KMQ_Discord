DELIMITER //
START TRANSACTION //
DROP PROCEDURE IF EXISTS BuildAvailableSongs //
CREATE PROCEDURE BuildAvailableSongs()
BEGIN
	/*
	 * BuildAvailableSongs
	 *
	 * Idempotent procedure that builds the available_songs table from
	 * expected_available_songs, filtered to only songs that have been
	 * successfully downloaded (in cached_song_duration) and are not
	 * in not_downloaded or dead_links.
	 *
	 * Also builds app_kpop_group_safe with a has_songs flag.
	 *
	 * Uses atomic RENAME swap so the table is always readable.
	 *
	 * Replaces: CreateKmqDataTables
	 */

	/* === Build available_songs via staging + atomic swap === */
	DROP TABLE IF EXISTS available_songs_staging;
	CREATE TABLE available_songs_staging LIKE expected_available_songs;
	CREATE TABLE IF NOT EXISTS available_songs LIKE available_songs_staging;

	INSERT INTO available_songs_staging
	SELECT
		song_name_en,
		clean_song_name_alpha_numeric,
		song_name_ko,
		song_aliases,
		link,
		better_audio_link,
		artist_name_en,
		original_artist_name_en,
		artist_name_ko,
		artist_aliases,
		previous_name_en,
		previous_name_ko,
		members,
		views,
		publishedon,
		id_artist,
		issolo,
		id_parent_artist,
		vtype,
		tags,
		dead,
		daisuki_id
	FROM expected_available_songs
	INNER JOIN kmq.cached_song_duration ON expected_available_songs.link = kmq.cached_song_duration.vlink
	LEFT JOIN kmq.not_downloaded ON expected_available_songs.link = kmq.not_downloaded.vlink
	WHERE kmq.not_downloaded.vlink IS NULL
	AND expected_available_songs.link NOT IN (SELECT vlink FROM kmq.dead_links);

	CREATE INDEX available_songs_id_artist_index ON available_songs_staging (id_artist);

	/* Atomic swap */
	DROP TABLE IF EXISTS available_songs_old;
	RENAME TABLE
		available_songs TO available_songs_old,
		available_songs_staging TO available_songs;
	DROP TABLE IF EXISTS available_songs_old;

	/* === Build app_kpop_group_safe via staging + atomic swap === */
	DROP TABLE IF EXISTS kpop_videos.app_kpop_group_safe_staging;
	CREATE TABLE kpop_videos.app_kpop_group_safe_staging LIKE kpop_videos.app_kpop_group;

	INSERT INTO kpop_videos.app_kpop_group_safe_staging
	SELECT * FROM kpop_videos.app_kpop_group;

	/* Add and populate has_songs flag */
	ALTER TABLE kpop_videos.app_kpop_group_safe_staging ADD COLUMN IF NOT EXISTS has_songs TINYINT(1) DEFAULT 0;
	UPDATE kpop_videos.app_kpop_group_safe_staging
	SET has_songs = 1
	WHERE id IN (SELECT DISTINCT(id_artist) FROM available_songs
	RIGHT JOIN kpop_videos.app_kpop_group_safe_staging ON available_songs.id_artist = kpop_videos.app_kpop_group_safe_staging.id);

	/* Atomic swap */
	CREATE TABLE IF NOT EXISTS kpop_videos.app_kpop_group_safe LIKE kpop_videos.app_kpop_group_safe_staging;
	RENAME TABLE
		kpop_videos.app_kpop_group_safe TO kpop_videos.app_kpop_group_safe_old,
		kpop_videos.app_kpop_group_safe_staging TO kpop_videos.app_kpop_group_safe;
	DROP TABLE IF EXISTS kpop_videos.app_kpop_group_safe_old;

END //
COMMIT //
DELIMITER ;
