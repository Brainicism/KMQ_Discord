DELIMITER //
START TRANSACTION //
DROP PROCEDURE IF EXISTS CreateKmqDataTables //
CREATE PROCEDURE CreateKmqDataTables()
BEGIN
	/* update available_songs table */
	DROP TABLE IF EXISTS available_songs_temp;
	CREATE TABLE available_songs_temp LIKE expected_available_songs;
	CREATE TABLE IF NOT EXISTS available_songs LIKE available_songs_temp;

	INSERT INTO available_songs_temp
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


	CREATE INDEX available_songs_id_artist_index ON available_songs_temp (id_artist);

	DROP TABLE IF EXISTS old;
	RENAME TABLE available_songs TO old, available_songs_temp TO available_songs;
	DROP TABLE old;

	/* atomically swap app_kpop_group to avoid race condition*/
	DROP TABLE IF EXISTS kpop_videos.app_kpop_group_temp;
	CREATE TABLE IF NOT EXISTS kpop_videos.app_kpop_group_temp LIKE kpop_videos.app_kpop_group;
	INSERT INTO kpop_videos.app_kpop_group_temp
	SELECT * FROM kpop_videos.app_kpop_group;

	/* mark artists as not having songs */
	ALTER TABLE kpop_videos.app_kpop_group_temp ADD COLUMN IF NOT EXISTS has_songs TINYINT(1) DEFAULT 0;
	UPDATE kpop_videos.app_kpop_group_temp
	SET has_songs = 1
	WHERE id in (SELECT DISTINCT(id_artist) FROM available_songs
	RIGHT JOIN kpop_videos.app_kpop_group_temp ON available_songs.id_artist = kpop_videos.app_kpop_group_temp.id);


	CREATE TABLE IF NOT EXISTS kpop_videos.app_kpop_group_safe LIKE kpop_videos.app_kpop_group_temp;
	RENAME TABLE kpop_videos.app_kpop_group_safe TO kpop_videos.old, kpop_videos.app_kpop_group_temp TO kpop_videos.app_kpop_group_safe;
	DROP TABLE kpop_videos.old;

END //
COMMIT //
DELIMITER ;
