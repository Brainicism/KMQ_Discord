# Instructions
## Prerequisites
- Ubuntu (tested on 16.04)
- MySQL (tested on 5.7)
- NodeJS (Requires at least v12)
- tsc + ts-node
- ffmpeg

## Docker
Building Image: `docker build --tag kmq:1.0 .`  

Running Image: `docker run --network="host"--mount type=bind,source=[host_song_cache_dir],target=[container_song_cache_dir] --mount type=bind,source=[host_log_dir],target=[container_log_dir] kmq:1.0`.

The target directories should match the ones specified in `app_config.json` and `log_config.json`. 

## First Time Setup
------------
1. `npm install`
    - `libsodium` might require the following packages: `autoconf automake g++ libtool`
2. Use `*.template` files to create own copy of configuration files in `src/config`
    - `app_config.json` contains application specific settings. See `src/config_validator.ts` to see required parameters. 
    - `knexfile_*.js` contains connection credentials for the each database connection. `kmq` is used for bot-specific database tables. `kpop_videos` is automatically created from the `aoimirai` backup
3. Apply database migrations for `kmq`. Using `npx knex migrate:latest --knexfile src/config/knexfile_kmq.js`
4. Get the latest `kpop_videos` data by running `npm run seed`. This will download the `aoimirai` kpop database dump, drop and recreate `kpop_videos`.  This script also attempt to download every song in the database that isn't downloaded locally. For development purposes, it isn't necessary to have every single song downloaded, so it is fine to kill the process after the database is downloaded.
5. Download a subset of songs for local testing. Run `ts-node src/scripts/download-new-songs [n]` to download the top `n` most viewed kpop videos.
6. `npm run dev` to start the bot

## Debug Mode
Having every song downloaded may be infeasible for local development. A debug mode can be activated by modifying `src/config/debug_settings.json`, and running in development mode. `forcedSongId` will force the bot to play a specific song given its ID. If `null`, will ignore this setting. `skipSongPlay` will start a game session with a song even if it is not downloaded on the local machine. 

## Creating Migrations
In order to modify the database schema, you need to create a migration file. This can be done using `npx knex migrate:make migration_name --knexfile src/config/knexfile_kmq.js`. Modify the created migration file to describe the change in schema. [Details here](http://knexjs.org/#Migrations).

A migration can be undone using `knex migrate:down migration_name.js --knexfile src/config/knexfile_kmq.js`

## Process Management
KMQ is hosted using PM2 as a process manager. Some scripts may assume that KMQ is being managed by `pm2` under the name `kmq`. 

## Scripts
Located under `src/scripts`  
- `announce-restart.ts [n]`: Set up a timer for `n` minutes before the bot is stopped. Each server currently playing a game will be notified at regular intervals until the shutdown  
- `download-new-songs.ts {n}`: If a parameter isn't specified, will download every song not currently downloaded. If specified, will download the top `n` most viewed songs according to the database.  
- `get-unclean-song-names.ts`: Returns a list of potentially unusual song names (hangul, hiragana, strange punctuation) to inspect. Used to check for songs that need aliasing.  
