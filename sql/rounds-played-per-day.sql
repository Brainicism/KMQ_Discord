SELECT DATE(start_date) AS date, SUM(rounds_played) AS rounds_played 
FROM kmq.game_sessions 
GROUP BY DATE
ORDER BY DATE DESC;
