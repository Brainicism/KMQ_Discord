## Aliases
`data/song_aliases.json` contains a mapping for YouTube video ID to an array of aliases. The data source we use is mostly crowdsourced, so it is prone to typos, errors, or a lack of proper song aliasing. Manually edit the song alias file to allow for multiple correct names for a given song. If a song name is geniunely incorrect on Aoimirai, it is preferred that you fix the name on *both* Aoimirai and `data/song_aliases.json`. The change will propagate to our database during the weekly seed, and the alias will be removed automatically. 

Similarly, `data/artist_aliases.json` is used for the same purpose but for artist names. 

Both of these alias files are automatically reloaded every 5 minutes.

## Publish Date Overrides
`data/publish_date_overrides.json` contains a mapping for YouTube video ID to an publish date override. The `publishedon` field in `app_kpop.kpop_videos` is the date the music video was uploaded to YouTube, not necessarily when they were released.

This mapping is also automatically reloaded every 5 minutes.
