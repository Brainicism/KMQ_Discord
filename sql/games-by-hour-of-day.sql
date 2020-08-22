SELECT HOUR(start_date) AS hour_of_day, 
	SUM(rounds_played)/(SELECT sum(rounds_played) AS total FROM (SELECT HOUR(start_date) AS hour_of_day, SUM(rounds_played) AS rounds_played
	FROM kmq.game_sessions 
	GROUP BY hour_of_day) AS X) * 100 AS proportion_games
FROM kmq.game_sessions
GROUP BY hour_of_day
ORDER BY hour_of_day;
