# Instructions

## Prerequisites

-   MariaDB/MySQL (tested on MariaDB 10.8.3, MySQL 5.7)
-   NodeJS (Requires at least v12)
-   tsc + ts-node
-   ffmpeg

## Docker

---

1. Install docker and docker-compose
2. `cd docker`
3. `docker-compose up --build`

See `docker/.env.sample` for the bare minimum .env required. Note that this
is different from the `.env` in the root directory.

For day-to-day development, consider using `docker-compose up -d db` and
keeping the database up while you restart and rebuild the KMQ container using
`docker-compose up --build kmq`. The dockerfile is optimized for fast
rebuilds if only the source files change.

The scripts referenced below can be used as long as the root .env file is set
up (see below). The docker-compose file forwards ports for mysql.

## Native

---

1. `bun install`
    - `libsodium` might require the following packages: `autoconf automake g++ libtool`
2. `.env` contains application specific settings. See `.env.example` to see parameters, and `environment.d.ts` to see which are required.
3. `npm run dev` to start the bot. Upon first run, the bot will bootstrap the database, as well as download 5 songs to have a minimally working bot
4. `ts-node src/scripts/download-new-songs` can be used to download the remaining songs in the database

## Creating Migrations

If you are bootstrapping the database, import the initial schema seed in `sql_dumps/kmq-test-cached.sql`. Create migrations in `migrations/` prefixing with a ISO 8601 date string. They will automatically be applied during bootstrap.

## Process Management

KMQ is hosted using PM2 as a process manager. Some scripts may assume that KMQ is being managed by `pm2` under the name `kmq`.

## Scripts

Located under `src/scripts`

-   `announce-restart.ts [n]`: Set up a timer for `n` minutes before the bot is stopped. Each server currently playing a game will be notified at regular intervals until the shutdown
-   `download-new-songs.ts {n}`: If a parameter isn't specified, will download every song not currently downloaded. If specified, will download the top `n` most viewed songs according to the database.
-   `get-unclean-song-names.ts`: Returns a list of potentially unusual song names (hangul, hiragana, strange punctuation) to inspect. Used to check for songs that need aliasing.
