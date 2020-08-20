SELECT nome AS song_name, vlink AS link, kpop_videos.app_kpop_group.name AS artist_name, kpop_videos.app_kpop.views AS views, DATE(publishedon) AS publish_date
FROM kpop_videos.app_kpop 
JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
WHERE vtype = 'main'
ORDER BY publishedon DESC
