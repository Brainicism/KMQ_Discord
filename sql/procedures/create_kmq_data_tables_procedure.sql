DELIMITER //
DROP PROCEDURE IF EXISTS CreateKmqDataTables //
CREATE PROCEDURE CreateKmqDataTables(
	IN maxRank INT
)
BEGIN
	/* update available_songs table */
	DROP TABLE IF EXISTS available_songs_temp;
	CREATE TABLE available_songs_temp (
		song_name_en VARCHAR(255) NOT NULL,
		clean_song_name_en VARCHAR(255) NOT NULL,
		song_name_ko VARCHAR(255) NOT NULL,
		clean_song_name_ko VARCHAR(255) NOT NULL,
		song_aliases VARCHAR(255) NOT NULL,
		link VARCHAR(255) NOT NULL,
		artist_name_en VARCHAR(255) NOT NULL,
		artist_name_ko VARCHAR(255),
		artist_aliases VARCHAR(255) NOT NULL,
		members ENUM('female','male','coed') NOT NULL,
		views BIGINT NOT NULL,
		publishedon DATE NOT NULL,
		id_artist INT(11) NOT NULL,
		issolo ENUM('y', 'n') NOT NULL,
		id_parent_artist INT(11) NOT NULL,
		vtype ENUM('main', 'audio') NOT NULL,
		tags VARCHAR(25),
		rank INT NOT NULL
	) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

	CREATE TABLE IF NOT EXISTS available_songs LIKE available_songs_temp;

	/* music videos */
	INSERT INTO available_songs_temp
	SELECT
		TRIM(kpop_videos.app_kpop.name) AS song_name_en,
		TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop.name, '(', 1)) AS clean_song_name_en,
		TRIM(kpop_videos.app_kpop.kname) AS song_name_ko,
		TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop.kname, '(', 1)) AS clean_song_name_ko,
		name_aka AS song_aliases,
		vlink AS link,
		TRIM(kpop_videos.app_kpop_group.name) AS artist_name_en,
		TRIM(kpop_videos.app_kpop_group.kname) AS artist_name_ko,
		kpop_videos.app_kpop_group.alias AS artist_aliases,
		kpop_videos.app_kpop_group.members AS members,
		kpop_videos.app_kpop.views AS views,
		releasedate as publishedon,
		kpop_videos.app_kpop_group.id as id_artist,
		issolo,
		id_parentgroup,
		vtype,
		tags,
		0 AS rank
	FROM kpop_videos.app_kpop
	JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
	INNER JOIN kmq.cached_song_duration USING (vlink)
	LEFT JOIN kmq.not_downloaded USING (vlink)
	WHERE kmq.not_downloaded.vlink IS NULL
	AND vtype = 'main'
	AND tags NOT LIKE "%c%"
	AND vlink IN (SELECT vlink FROM kmq.cached_song_duration);

	/* audio-only videos */
	INSERT INTO available_songs_temp
	SELECT *
	FROM (
		SELECT
			TRIM(kpop_videos.app_kpop_audio.name) AS song_name_en,
			TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop_audio.name, '(', 1)) AS clean_song_name_en,
			TRIM(kpop_videos.app_kpop_audio.kname) AS song_name_ko,
			TRIM(SUBSTRING_INDEX(kpop_videos.app_kpop_audio.kname, '(', 1)) AS clean_song_name_ko,
			name_aka AS song_aliases,
			vlink AS link,
			TRIM(kpop_videos.app_kpop_group.name) AS artist_name_en,
			TRIM(kpop_videos.app_kpop_group.kname) AS artist_name_ko,
			kpop_videos.app_kpop_group.alias AS artist_aliases,
			kpop_videos.app_kpop_group.members AS members,
			kpop_videos.app_kpop_audio.views AS views,
			releasedate as publishedon,
			kpop_videos.app_kpop_group.id AS id_artist,
			issolo,
			id_parentgroup,
			'audio' AS vtype,
			tags,
			RANK() OVER(PARTITION BY app_kpop_audio.id_artist ORDER BY views DESC) AS rank
		FROM kpop_videos.app_kpop_audio
		JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop_audio.id_artist = kpop_videos.app_kpop_group.id
		INNER JOIN kmq.cached_song_duration USING (vlink)
		LEFT JOIN kmq.not_downloaded USING (vlink)
		WHERE kmq.not_downloaded.vlink IS NULL
		AND tags NOT LIKE "%c%"
	) rankedAudioSongs
	WHERE rank <= maxRank;

	DELETE FROM available_songs_temp WHERE clean_song_name_en = '';

	RENAME TABLE available_songs TO old, available_songs_temp TO available_songs;
	DROP TABLE old;
END //
DELIMITER ;
