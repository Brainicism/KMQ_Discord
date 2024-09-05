DELIMITER //
DROP PROCEDURE IF EXISTS GenerateExpectedAvailableSongs //
CREATE PROCEDURE GenerateExpectedAvailableSongs()
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

	/* Generate table of expected available songs */
	DROP TABLE IF EXISTS expected_available_songs;
	CREATE TABLE expected_available_songs (
		song_name_en VARCHAR(255) NOT NULL,
		clean_song_name_alpha_numeric VARCHAR(255) NOT NULL,
		song_name_ko VARCHAR(255) NOT NULL,
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
		tags VARCHAR(25),
		dead ENUM('y', 'n') NOT NULL,
		daisuki_id INT(11) NOT NULL
	) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

	INSERT INTO expected_available_songs
	SELECT
		kpop_videos.app_kpop.name AS song_name_en,
		(CASE 
			WHEN kpop_videos.app_kpop.name REGEXP '^[^a-zA-Z0-9]+$' -- no-op if song name is fully non-alphanumeric (i.e punctuation)
			THEN kpop_videos.app_kpop.name 
			WHEN kpop_videos.app_kpop.name REGEXP '\\([^)]*\\)$' -- ignore bracketed part if at end of the song name
			THEN REGEXP_REPLACE(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1), '[^0-9a-zA-Z]', '') 
			ELSE REGEXP_REPLACE(kpop_videos.app_kpop.name, '[^0-9a-zA-Z]', '') -- regular cleaning
		END) AS clean_song_name_alpha_numeric,
		kpop_videos.app_kpop.kname AS song_name_ko,
		kpop_videos.app_kpop.alias AS song_aliases,
		vlink AS link,
		kpop_videos.app_kpop.original_vlink AS original_link,
		kpop_videos.app_kpop_group.name AS artist_name_en,
		kpop_videos.app_kpop_group.original_name AS original_artist_name_en,
		kpop_videos.app_kpop_group.kname AS artist_name_ko,
		REPLACE(kpop_videos.app_kpop_group.alias, '; ', ';') AS artist_aliases,
		kpop_videos.app_kpop_group.previous_name AS previous_name_en,
		kpop_videos.app_kpop_group.previous_kname AS previous_name_ko,
		kpop_videos.app_kpop_group.members AS members,
		kpop_videos.app_kpop.views AS views,
		releasedate as publishedon,
		kpop_videos.app_kpop_group.id as id_artist,
		issolo,
		id_parentgroup,
		IF(kpop_videos.app_kpop.is_audio = 'n', 'main', 'audio'),
		tags,
		kpop_videos.app_kpop.dead AS dead,
		kpop_videos.app_kpop.id as daisuki_id
	FROM kpop_videos.app_kpop
	JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
	AND vtype = 'main'
	AND kpop_videos.app_kpop.name REGEXP '[0-9a-zA-Z[:punct:]]' -- only songs with english song names
	AND tags NOT LIKE "%c%" -- no covers
	AND tags NOT LIKE "%x%"; -- no remixes

END //
DELIMITER ;
