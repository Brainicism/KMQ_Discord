SELECT DATE(start_date) AS date, COUNT(*) AS count
FROM kmq.game_sessions
GROUP BY DATE
ORDER BY DATE DESC;
