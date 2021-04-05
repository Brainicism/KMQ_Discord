# Instructions
## Prerequisites
- Ubuntu (tested on 16.04)
- MySQL (tested on 5.7)
- NodeJS (Requires at least v12)
- tsc + ts-node
- ffmpeg

## Docker
------------
1. Install docker and docker-compose
2. `cd docker`
3. `docker-compose up --build`

See `docker/.env.sample` for the bare minimum .env required. Note that this
is different from the `.env` in the root directory.

For day-to-day development, consider using `docker-compose up -d db` and
keeping the database up while you restart and rebuild the kmq container using
`docker-compose up --build kmq`. The dockerfile is optimized for fast
rebuilds if only the source files change.

The scripts referenced below can be used as long as the root .env file is set
up (see below). The docker-compose file forwards ports for mysql.

## Native
------------
1. `yarn install`
    - `libsodium` might require the following packages: `autoconf automake g++ libtool`
2. Use `*.template` files to create own copy of configuration files in `src/config`
    - `.env` contains application specific settings. See `.env.example` to see parameters, and `environment.d.ts` to see which are required. 
3. Apply database migrations for `kmq`. Using `npx knex migrate:latest --knexfile src/config/knexfile_kmq.js`
4. `npm run dev` to start the bot. Upon first run, the bot will bootstrap the database, as well as download 5 songs to have a minimally working bot
5. `ts-node src/scripts/download-new-songs` can be used to download the remaining songs in the database

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
