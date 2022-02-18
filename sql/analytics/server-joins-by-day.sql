SELECT COUNT(*) AS rounds_played, DATE(join_date) AS join_day
FROM kmq.guilds
WHERE join_date IS NOT NULL
GROUP BY join_day
ORDER BY join_day DESC;
