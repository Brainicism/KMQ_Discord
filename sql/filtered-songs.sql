SELECT nome AS song_name, vlink AS link, kpop_videos.app_kpop_group.name AS artist_name, kpop_videos.app_kpop.views AS views
FROM kpop_videos.app_kpop 
JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
WHERE vlink NOT IN (SELECT vlink FROM kmq.not_downloaded)
AND members IN ('male', 'female')
AND dead = 'n'
AND publishedon >= TIMESTAMP('?-01-01')
AND publishedon <= TIMESTAMP('?-12-31')
AND vtype = 'main'
ORDER BY kpop_videos.app_kpop.views DESC
