DELIMITER //
DROP PROCEDURE IF EXISTS PostSeedDataCleaning //
CREATE PROCEDURE PostSeedDataCleaning()
BEGIN

    /* update collations of columns that have user-inputted queries */
	ALTER TABLE kpop_videos.app_kpop_group MODIFY name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
	ALTER TABLE kpop_videos.app_kpop_group MODIFY kname VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

	/* de-duplicate conflicting names */
	ALTER TABLE kpop_videos.app_kpop_group ADD COLUMN IF NOT EXISTS original_name VARCHAR(255) NOT NULL;
	UPDATE kpop_videos.app_kpop_group SET original_name = name;
	
	UPDATE kpop_videos.app_kpop_group as a
	RIGHT JOIN
	(SELECT LOWER(name) as name, count(*) as c FROM kpop_videos.app_kpop_group GROUP BY LOWER(name) HAVING count(*) > 1 AND name NOT LIKE "%(%)%" ) as b USING (name)
	SET a.name = concat(a.name, " (", a.fname, ")")
	WHERE a.fname <> '';

	/* remove bracketed components from song names */
	ALTER TABLE kpop_videos.app_kpop ADD COLUMN IF NOT EXISTS original_name VARCHAR(255) NOT NULL;
	UPDATE kpop_videos.app_kpop SET original_name = name;
	
	UPDATE kpop_videos.app_kpop 
	SET name = (CASE name LIKE '%(%' AND RIGHT(name, 1) = ')' WHEN 1 THEN TRIM(SUBSTRING_INDEX(name, '(', 1)) ELSE name END);
END //
DELIMITER ;
