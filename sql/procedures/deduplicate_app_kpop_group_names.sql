DELIMITER //
DROP PROCEDURE IF EXISTS DeduplicateGroupNames //
CREATE PROCEDURE DeduplicateGroupNames()
BEGIN
	/* de-duplicate conflicting names */
	ALTER TABLE kpop_videos.app_kpop_group ADD COLUMN IF NOT EXISTS original_name VARCHAR(255);
	UPDATE kpop_videos.app_kpop_group SET original_name = name;
	
	UPDATE kpop_videos.app_kpop_group as a
	RIGHT JOIN
	(SELECT LOWER(name) as name, count(*) as c FROM kpop_videos.app_kpop_group GROUP BY LOWER(name) HAVING count(*) > 1 AND name NOT LIKE "%(%)%" ) as b USING (name)
	SET a.name = concat(a.name, " (", a.fname, ")");
	
END //
DELIMITER ;
