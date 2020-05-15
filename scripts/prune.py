'''
Script to help prune expired songs or manage song cache size. Run daily as a cron job.
'''
import sys
from os import listdir, remove
from os.path import join, getmtime, getsize
from time import time
from math import floor

if __name__ == "__main__":
    size_limit = int(sys.argv[1])
    age_limit = int(sys.argv[2])
    song_cache_path = sys.argv[3]
    cached_songs_paths = [join(song_cache_path, f) for f in listdir(song_cache_path)]
    cached_songs = [{"path": p, "size": getsize(p)/(1024**2), "lastModified": getmtime(p)} for p in cached_songs_paths]
    cached_songs.sort(key=lambda x: x["lastModified"])
    cache_size = sum(cached_song["size"] for cached_song in cached_songs)
    print("Cache size: " + str(floor(cache_size)) + " MB")
    print("# of cached songs: " + str(len(cached_songs)))
    curr_pos = 0

    overcapacity_delete_count = 0
    if cache_size > size_limit:
        difference = cache_size - size_limit
        print("Attempting to remove " + str(difference) + " MB of cached songs")
        while difference > 0:
            cached_song = cached_songs[curr_pos]
            remove(cached_song["path"])
            difference -= cached_song["size"]
            curr_pos += 1
            overcapacity_delete_count += 1
    print("Removed " + str(overcapacity_delete_count) + " cached songs to reach size limit")

    print("Attempting to remove songs older than " + str(age_limit) + " days")
    current_time = int(time())
    expired_delete_count = 0
    while True:
        cached_song = cached_songs[curr_pos]
        time_difference = (current_time - cached_song["lastModified"])/86400
        if time_difference < age_limit:
            break
        remove(cached_song["path"])
        expired_delete_count += 1
        curr_pos += 1
    print("Removed " + str(expired_delete_count) +" expired cached songs")
    