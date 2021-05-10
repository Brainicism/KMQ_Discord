## Aliases
`data/artist_aliases.json` is used to alias artist names for one of two purposes: accepting parent groups of subunits as correct guesses for `,mode artist/both` ("guessAliases"), and alternate commonly used names for group name matching for `,groups` ("matchAliases").

This alias file is automatically reloaded every 5 minutes.

## Publish Date Overrides
`data/publish_date_overrides.json` contains a mapping for YouTube video ID to an publish date override. The `publishedon` field in `app_kpop.kpop_videos` is the date the music video was uploaded to YouTube, not necessarily when they were released.

This mapping is also automatically reloaded every 5 minutes.
