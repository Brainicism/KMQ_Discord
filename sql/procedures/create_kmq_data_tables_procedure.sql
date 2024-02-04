DELIMITER //
DROP PROCEDURE IF EXISTS CreateKmqDataTables //
CREATE PROCEDURE CreateKmqDataTables()
BEGIN
	/* replace songs with better audio counterpart */
	ALTER TABLE kpop_videos.app_kpop ADD COLUMN IF NOT EXISTS original_vlink VARCHAR(255);
	DROP TEMPORARY TABLE IF EXISTS temp_tbl;
	CREATE TEMPORARY TABLE temp_tbl
	SELECT a.id as original_id, a.original_name as original_name, a.vlink as original_link, b.vlink as better_audio_link
	FROM kpop_videos.app_kpop as a
	LEFT JOIN kpop_videos.app_kpop as b ON a.id_better_audio = b.id
	WHERE b.vlink is not null
	AND a.vtype IN ('main', 'audio');

	DELETE kpop_videos.app_kpop FROM kpop_videos.app_kpop
	JOIN temp_tbl tt on kpop_videos.app_kpop.vlink = tt.better_audio_link
	WHERE kpop_videos.app_kpop.vlink = tt.better_audio_link;

	UPDATE kpop_videos.app_kpop JOIN temp_tbl tt on kpop_videos.app_kpop.id = tt.original_id
	SET kpop_videos.app_kpop.vlink = tt.better_audio_link, kpop_videos.app_kpop.original_vlink = tt.original_link;

	/* update available_songs table */
	DROP TABLE IF EXISTS available_songs_temp;
	CREATE TABLE available_songs_temp (
		song_name_en VARCHAR(255) NOT NULL,
		clean_song_name_en VARCHAR(255) NOT NULL,
		clean_song_name_alpha_numeric VARCHAR(255) NOT NULL,
		song_name_ko VARCHAR(255) NOT NULL,
		clean_song_name_ko VARCHAR(255) NOT NULL,
		song_aliases VARCHAR(255) NOT NULL,
		link VARCHAR(255) NOT NULL,
		original_link VARCHAR(255),
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
		tags VARCHAR(25)
	) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

	CREATE TABLE IF NOT EXISTS available_songs LIKE available_songs_temp;

	/* music videos */
	INSERT INTO available_songs_temp
	SELECT
		TRIM(kpop_videos.app_kpop.name) AS song_name_en,
		TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1)) AS clean_song_name_en,
		(CASE WHEN kpop_videos.app_kpop.name REGEXP '^[^a-zA-Z0-9]+$' THEN kpop_videos.app_kpop.name ELSE REGEXP_REPLACE(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1), '[^0-9a-zA-Z]', '') END) AS clean_song_name_alpha_numeric,
		TRIM(kpop_videos.app_kpop.kname) AS song_name_ko,
		TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop.kname, '(', 1)) AS clean_song_name_ko,
		kpop_videos.app_kpop.alias AS song_aliases,
		vlink AS link,
		kpop_videos.app_kpop.original_vlink AS original_link,
		TRIM(kpop_videos.app_kpop_group.name) AS artist_name_en,
		TRIM(kpop_videos.app_kpop_group.original_name) AS original_artist_name_en,
		TRIM(kpop_videos.app_kpop_group.kname) AS artist_name_ko,
		kpop_videos.app_kpop_group.alias AS artist_aliases,
		kpop_videos.app_kpop_group.previous_name AS previous_name_en,
		kpop_videos.app_kpop_group.previous_kname AS previous_name_ko,
		kpop_videos.app_kpop_group.members AS members,
		kpop_videos.app_kpop.views AS views,
		releasedate as publishedon,
		kpop_videos.app_kpop_group.id as id_artist,
		issolo,
		id_parentgroup,
		vtype,
		tags
	FROM kpop_videos.app_kpop
	JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
	INNER JOIN kmq.cached_song_duration USING (vlink)
	LEFT JOIN kmq.not_downloaded USING (vlink)
	WHERE kmq.not_downloaded.vlink IS NULL
	AND kpop_videos.app_kpop.is_audio = 'n'
	AND vlink NOT IN (SELECT vlink FROM kmq.dead_links)
	AND vtype = 'main'
	AND tags NOT LIKE "%c%"
	AND vlink IN (SELECT vlink FROM kmq.cached_song_duration);

	/* audio-only videos */
	INSERT INTO available_songs_temp
	SELECT
		TRIM(kpop_videos.app_kpop.name) AS song_name_en,
		TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1)) AS clean_song_name_en,
		(CASE WHEN kpop_videos.app_kpop.name REGEXP '^[^a-zA-Z0-9]+$' THEN kpop_videos.app_kpop.name ELSE REGEXP_REPLACE(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1), '[^0-9a-zA-Z]', '') END) AS clean_song_name_alpha_numeric,
		TRIM(kpop_videos.app_kpop.kname) AS song_name_ko,
		TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop.kname, '(', 1)) AS clean_song_name_ko,
		kpop_videos.app_kpop.alias AS song_aliases,
		vlink AS link,
		null,
		TRIM(kpop_videos.app_kpop_group.name) AS artist_name_en,
		TRIM(kpop_videos.app_kpop_group.original_name) AS original_artist_name_en,
		TRIM(kpop_videos.app_kpop_group.kname) AS artist_name_ko,
		kpop_videos.app_kpop_group.alias AS artist_aliases,
		kpop_videos.app_kpop_group.previous_name AS previous_name_en,
		kpop_videos.app_kpop_group.previous_kname AS previous_name_ko,
		kpop_videos.app_kpop_group.members AS members,
		kpop_videos.app_kpop.views AS views,
		releasedate as publishedon,
		kpop_videos.app_kpop_group.id AS id_artist,
		issolo,
		id_parentgroup,
		'audio' AS vtype,
		tags
	FROM kpop_videos.app_kpop
	JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
	INNER JOIN kmq.cached_song_duration USING (vlink)
	LEFT JOIN kmq.not_downloaded USING (vlink)
	WHERE kmq.not_downloaded.vlink IS NULL
	AND kpop_videos.app_kpop.is_audio = 'y'
	AND vlink NOT IN (SELECT vlink FROM kmq.dead_links)
	AND tags NOT LIKE "%c%";


	DELETE FROM available_songs_temp WHERE clean_song_name_en = '';

	RENAME TABLE available_songs TO old, available_songs_temp TO available_songs;
	DROP TABLE old;

	/* mark artists as not having songs */
	ALTER TABLE kpop_videos.app_kpop_group ADD COLUMN IF NOT EXISTS has_songs TINYINT(1) DEFAULT 1;

	UPDATE kmq.available_songs RIGHT JOIN kpop_videos.app_kpop_group ON kmq.available_songs.id_artist = kpop_videos.app_kpop_group.id
	SET has_songs = kmq.available_songs.song_name_en is not null;

END //
DELIMITER ;
