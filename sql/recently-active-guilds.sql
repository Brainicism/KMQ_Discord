SELECT *
FROM kmq.guild_preferences
WHERE last_active IS NOT NULL 
AND last_active > DATE_SUB(NOW(), INTERVAL 14 DAY);
