DELIMITER //
DROP PROCEDURE IF EXISTS PostSeedDataCleaning //
CREATE PROCEDURE PostSeedDataCleaning()
BEGIN
	/* de-duplicate conflicting names */
	ALTER TABLE kpop_videos.app_kpop_group ADD COLUMN IF NOT EXISTS original_name VARCHAR(255);
	UPDATE kpop_videos.app_kpop_group SET original_name = name;
	
	UPDATE kpop_videos.app_kpop_group as a
	RIGHT JOIN
	(SELECT LOWER(name) as name, count(*) as c FROM kpop_videos.app_kpop_group GROUP BY LOWER(name) HAVING count(*) > 1 AND name NOT LIKE "%(%)%" ) as b USING (name)
	SET a.name = concat(a.name, " (", a.fname, ")")
	WHERE a.fname <> '';

	/* remove bracketed components from song names */
	ALTER TABLE kpop_videos.app_kpop ADD COLUMN IF NOT EXISTS original_name VARCHAR(255);
	UPDATE kpop_videos.app_kpop SET original_name = name;
	
	UPDATE kpop_videos.app_kpop 
	SET name = (CASE name LIKE '%(%' AND RIGHT(name, 1) = ')' WHEN 1 THEN TRIM(SUBSTRING_INDEX(name, '(', 1)) ELSE name END);

	/* mark artists as not having songs */
	ALTER TABLE kpop_videos.app_kpop_group ADD COLUMN IF NOT EXISTS has_songs TINYINT(1) DEFAULT 1;

	UPDATE kpop_videos.app_kpop_group
	SET has_songs = 0
	WHERE id in (SELECT id FROM kmq.available_songs
	RIGHT JOIN kpop_videos.app_kpop_group ON kmq.available_songs.id_artist = kpop_videos.app_kpop_group.id
	WHERE song_name_en is null);
END //
DELIMITER ;
