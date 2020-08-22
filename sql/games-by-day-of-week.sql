SELECT DAYNAME(start_date) AS day_of_week, 
	SUM(rounds_played)/(SELECT sum(rounds_played) AS total FROM (SELECT DAYNAME(start_date) AS day_of_week, SUM(rounds_played) AS rounds_played
	FROM kmq.game_sessions 
	GROUP BY day_of_week) AS X) * 100 AS proportion_games
FROM kmq.game_sessions
GROUP BY day_of_week
ORDER BY day_of_week;
