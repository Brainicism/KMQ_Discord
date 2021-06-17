DELIMITER //
DROP PROCEDURE IF EXISTS CreateKmqDataTables //
CREATE PROCEDURE CreateKmqDataTables()
BEGIN
	/* update available_songs table */
	DROP TABLE IF EXISTS available_songs_temp;
	CREATE TABLE available_songs_temp (
		song_name VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,
		song_aliases VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,
		link VARCHAR(255) NOT NULL,
		artist_name VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,
		members ENUM('female','male','coed') NOT NULL,
		views BIGINT NOT NULL,
		publishedon DATE NOT NULL,
		id_artist INT(11) NOT NULL,
		issolo ENUM('y', 'n') NOT NULL,
		id_parent_artist INT(11) NOT NULL,
		vtype ENUM('main', 'audio') NOT NULL,
		tags VARCHAR(25)
	);

	CREATE TABLE IF NOT EXISTS available_songs LIKE available_songs_temp;

    /* music videos */
	INSERT INTO available_songs_temp
	SELECT
        TRIM(app_kpop.name) AS song_name,
        name_aka AS song_aliases,
        vlink AS link,
        TRIM(kpop_videos.app_kpop_group.name) AS artist_name,
        kpop_videos.app_kpop_group.members AS members,
        kpop_videos.app_kpop.views AS views,
        publishedon,
        kpop_videos.app_kpop_group.id as id_artist,
        issolo,
        id_parentgroup,
        vtype,
        tags
	FROM kpop_videos.app_kpop
	JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
	WHERE vlink NOT IN (SELECT vlink FROM kmq.not_downloaded)
	AND vtype = 'main'
	AND tags NOT LIKE "%c%"
	AND vlink IN (SELECT vlink FROM kmq.cached_song_duration);

    /* audio-only videos */
	INSERT INTO available_songs_temp
	SELECT
        TRIM(app_kpop_audio.name) AS song_name,
        name_aka AS song_aliases,
        vlink AS link,
        TRIM(kpop_videos.app_kpop_group.name) AS artist_name,
        kpop_videos.app_kpop_group.members AS members,
        kpop_videos.app_kpop_audio.views AS views,
        publishedon,
        kpop_videos.app_kpop_group.id AS id_artist,
        issolo,
        id_parentgroup,
        'audio' AS vtype,
        tags
	FROM kpop_videos.app_kpop_audio
	JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop_audio.id_artist = kpop_videos.app_kpop_group.id
	WHERE vlink NOT IN (SELECT vlink FROM kmq.not_downloaded)
	AND tags NOT LIKE "%c%"
	AND vlink IN (SELECT vlink FROM kmq.cached_song_duration);

	RENAME TABLE available_songs TO old, available_songs_temp TO available_songs;
	DROP TABLE old;
	
	/* copy over new copy of app_kpop_group */
	DROP TABLE IF EXISTS kmq.kpop_groups_temp;
	CREATE TABLE kmq.kpop_groups_temp LIKE kpop_videos.app_kpop_group;
	INSERT kmq.kpop_groups_temp	SELECT	* FROM kpop_videos.app_kpop_group;

	CREATE TABLE IF NOT EXISTS kmq.kpop_groups LIKE kpop_videos.app_kpop_group;
	RENAME TABLE kmq.kpop_groups TO old, kmq.kpop_groups_temp TO kmq.kpop_groups;
	DROP TABLE old;
END //
DELIMITER ;
