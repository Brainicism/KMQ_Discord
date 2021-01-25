DELIMITER //

DROP PROCEDURE IF EXISTS CreateAvailableSongsTable //
CREATE PROCEDURE CreateAvailableSongsTable()
BEGIN
	DROP TABLE IF EXISTS available_songs_temp;
	CREATE TABLE available_songs_temp (
		song_name VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,
		link VARCHAR(255) NOT NULL,
		artist_name VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,
		members ENUM('female','male','coed') NOT NULL,
		views BIGINT NOT NULL,
		publishedon DATE NOT NULL,
		id_artist INT(11) NOT NULL,
		issolo ENUM("y", 'n') NOT NULL
	);

	CREATE TABLE IF NOT EXISTS available_songs (
		song_name VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,
		link VARCHAR(255) NOT NULL,
		artist_name VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,
		members ENUM('female','male','coed') NOT NULL,
		views BIGINT NOT NULL,
		publishedon DATE NOT NULL,
		id_artist INT(11) NOT NULL
	);

	INSERT INTO available_songs_temp 
	SELECT TRIM(nome) AS song_name, vlink AS link, TRIM(kpop_videos.app_kpop_group.name) AS artist_name, kpop_videos.app_kpop_group.members as members, kpop_videos.app_kpop.views AS views, publishedon, kpop_videos.app_kpop_group.id as id_artist, issolo
	FROM kpop_videos.app_kpop 
	JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
	WHERE vlink NOT IN (SELECT vlink FROM kmq.not_downloaded)
	AND dead = 'n'
	AND vtype = 'main'
	ORDER BY kpop_videos.app_kpop.views DESC;

	RENAME TABLE available_songs TO old, available_songs_temp TO available_songs;
	DROP TABLE old;
END //
DELIMITER ;
