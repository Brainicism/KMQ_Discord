DELIMITER //
START TRANSACTION //
DROP PROCEDURE IF EXISTS GenerateExpectedAvailableSongs //
CREATE PROCEDURE GenerateExpectedAvailableSongs()
BEGIN
	/* Generate table of expected available songs.
	 *
	 * better_audio_link is resolved inline via a LEFT JOIN on app_kpop
	 * (a.id_better_audio → b.vlink) instead of mutating app_kpop in place.
	 * Audio-only rows (those that ARE a better-audio target) are excluded
	 * with a NOT IN subquery rather than being DELETEd from the source table.
	 *
	 * This keeps app_kpop pristine and makes the procedure fully idempotent —
	 * safe to run multiple times or concurrently without corrupting data. */
	DROP TABLE IF EXISTS expected_available_songs;
	CREATE TABLE expected_available_songs (
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

	INSERT INTO expected_available_songs
	SELECT
		a.name AS song_name_en,
		(CASE 
			WHEN a.name REGEXP '^[^a-zA-Z0-9]+$' -- no-op if song name is fully non-alphanumeric (i.e punctuation)
			THEN a.name 
			WHEN a.name REGEXP '\\([^)]*\\)$' -- ignore bracketed part if at end of the song name
			THEN CleanSongName(SUBSTRING_INDEX(a.name, '(', 1))
			ELSE CleanSongName(a.name) -- regular cleaning
		END) AS clean_song_name_alpha_numeric,
		a.kname AS song_name_ko,
		a.alias AS song_aliases,
		a.vlink AS link,
		better_audio.vlink AS better_audio_link,
		grp.name AS artist_name_en,
		grp.original_name AS original_artist_name_en,
		grp.kname AS artist_name_ko,
		REPLACE(grp.alias, '; ', ';') AS artist_aliases,
		grp.previous_name AS previous_name_en,
		grp.previous_kname AS previous_name_ko,
		grp.members AS members,
		a.views AS views,
		a.releasedate as publishedon,
		grp.id as id_artist,
		grp.issolo,
		grp.id_parentgroup,
		IF(a.is_audio = 'n', 'main', 'audio'),
		a.tags,
		a.dead AS dead,
		a.id as daisuki_id
	FROM kpop_videos.app_kpop a
	JOIN kpop_videos.app_kpop_group grp ON a.id_artist = grp.id
	/* Resolve better audio: look up the audio-only row's vlink inline */
	LEFT JOIN kpop_videos.app_kpop better_audio ON a.id_better_audio = better_audio.id
	WHERE a.vtype = 'main'
	AND a.name REGEXP '[0-9a-zA-Z[:punct:]]' -- only songs with english song names
	AND a.tags NOT LIKE "%c%" -- no covers
	AND a.tags NOT LIKE "%x%" -- no remixes
	/* Exclude audio-only rows that exist solely as better-audio targets */
	AND a.id NOT IN (
		SELECT DISTINCT id_better_audio
		FROM kpop_videos.app_kpop
		WHERE id_better_audio IS NOT NULL
	);

END //
COMMIT //
DELIMITER ;
