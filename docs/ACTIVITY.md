# KMQ Discord Activity

The KMQ Activity is an embedded iframe ("Activity") that runs alongside the
bot's voice connection and surfaces the scoreboard, current round, guess
input, song history, game controls, and game options in-client. The bot keeps
owning audio playback and Discord command entry points; the iframe is a
richer view on the same session.

This document covers:

1. [Discord developer portal configuration](#1-discord-developer-portal-configuration)
2. [Required environment variables](#2-required-environment-variables)
3. [Running it in native development](#3-running-it-in-native-development)
4. [Running it in Docker](#4-running-it-in-docker)
5. [Deploying behind a reverse proxy](#5-deploying-behind-a-reverse-proxy)
6. [Runtime flags](#6-runtime-flags)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Discord developer portal configuration

The Activity reuses your bot's existing application — you do **not** create a
separate Discord app. All config lives under
<https://discord.com/developers/applications/YOUR_APPLICATION_ID>.

### OAuth2 redirect

- **OAuth2 → Redirects**: add the Activity's public HTTPS origin (e.g.
  `https://activity.example.com`). This only needs to match the base URL of
  the Activity; the SPA handles the code exchange at `/api/activity/token`.

### Activity settings

Under **Activities** (left sidebar in the dev portal):

- **Enable Activities**: on.
- **Supported platforms**: enable Desktop and/or Mobile as appropriate.
- **Orientation**: KMQ defaults to landscape; the sidebars collapse to
  overlays on narrow viewports so portrait works too.

### URL Mappings

The Activity iframe is sandboxed — only hosts registered as URL Mappings can
be reached. KMQ needs three mappings:

| Prefix          | Target                                  | Purpose                                                           |
| --------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `/`             | `activity.example.com` (your origin)    | Root — serves the SPA and the `/api/activity/*` + `/ws/activity`. |
| `/external/yt/` | `i.ytimg.com`                           | YouTube thumbnails (song reveal tiles).                           |

Only the root mapping is strictly required — without `/external/yt/` the
Activity runs but thumbnails fail to load.

### Scopes

The SPA requests `identify` and `guilds.members.read` during the SDK
`authorize` call. Both are standard scopes; no "bot" or "applications.
commands" scope changes are needed.

### Client secret

Copy the **Client Secret** from the dev portal's OAuth2 page — you'll set it
as `DISCORD_CLIENT_SECRET` below. KMQ uses it server-side only to exchange
the OAuth `code` for an access token.

---

## 2. Required environment variables

The Activity needs three vars beyond the normal bot vars:

| Var                        | Where it's read                                                                       | Value                                                              |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `BOT_CLIENT_ID`            | Server (runtime) **and** Activity bundle (build time via `activity/vite.config.ts`)   | Your Discord application ID.                                       |
| `DISCORD_CLIENT_SECRET`    | Server only                                                                           | Discord OAuth2 client secret.                                      |
| `ACTIVITY_PUBLIC_BASE_URL` | Server only                                                                           | Public HTTPS origin registered in the dev portal (no trailing `/`).|

All three are declared in `src/environment.d.ts` and documented in
`docker/.env.sample`.

### Env file paths at a glance

Which `.env` file the process reads depends on how you launch it:

| Launch path                        | Which `.env` flows in                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev` / `npm run prod`     | Project-root `.env` (loaded by `dotenv` at process start).                   |
| `npm run docker-compose-*`         | `docker/.env` only (compose looks next to its yml). Project-root `.env` is ignored. |
| `npm run docker-build`             | **No** `.env` — `docker build` does not read env files. Pass `--build-arg BOT_CLIENT_ID=...` explicitly or use the compose scripts. |
| `npm run docker-run-internal`      | Project-root `.env` (sourced by the wrapper script) for runtime variables.   |
| `yarn dev` inside `activity/`      | `activity/.env.local` for the Vite dev server. Only `BOT_CLIENT_ID` is read (Vite's envPrefix). |

Leaving `DISCORD_CLIENT_SECRET` or `ACTIVITY_PUBLIC_BASE_URL` blank is fine
for a bot-only deployment — the Activity routes still exist but
`POST /api/activity/token` returns 500 and the iframe will fail to
authenticate.

---

## 3. Running it in native development

Native dev runs the bot, the database, and the Vite dev server as three
separate processes on your host.

1. **Install dependencies**

   ```sh
   yarn install
   cd activity && yarn install && cd ..
   ```

2. **Project-root `.env`** (see `.env.example`):

   ```dotenv
   BOT_TOKEN=...
   BOT_CLIENT_ID=399645526783557642
   DB_USER=root
   DB_PASS=db_pass
   DB_HOST=localhost
   DB_PORT=3306
   SONG_DOWNLOAD_DIR=/tmp/kmq-songs
   APP_NAME=kmq-dev
   DAISUKI_DB_PASSWORD=...
   WEB_SERVER_PORT=5858

   DISCORD_CLIENT_SECRET=...
   ACTIVITY_PUBLIC_BASE_URL=https://your-tunnel-hostname.trycloudflare.com
   ```

3. **`activity/.env.local`** (only used by `yarn dev`; Vite's envPrefix
   whitelists `BOT_CLIENT_ID`):

   ```dotenv
   BOT_CLIENT_ID=399645526783557642
   ```

4. **Build the Activity bundle once** so the bot's Fastify static handler
   has something to serve:

   ```sh
   cd activity && yarn build && cd ..
   ```

   (Re-run on any activity source change, or run `yarn dev` instead — see
   step 7.)

5. **Start the bot**:

   ```sh
   npm run dev
   ```

   Wait for `All shards connected` in the logs. The bot starts the Fastify
   web server on `WEB_SERVER_PORT`; `/activity/` serves the built bundle and
   `/api/activity/*` + `/ws/activity` are live.

6. **Expose `http://localhost:$WEB_SERVER_PORT` as HTTPS.** Discord
   Activities require HTTPS. Two common options:

   - `cloudflared tunnel --url http://localhost:5858` — gives you a stable
     `*.trycloudflare.com` URL.
   - `ngrok http 5858` — gives a `*.ngrok-free.app` URL.

   Paste the resulting HTTPS URL into the dev portal as the root URL Mapping
   target, and into `ACTIVITY_PUBLIC_BASE_URL` in `.env`.

7. **(Optional) hot-reload frontend** — instead of rebuilding after every
   change, run the Vite dev server alongside:

   ```sh
   cd activity && yarn dev
   ```

   Vite listens on `:5173`. You'll need the tunnel pointed at that port, and
   a URL Mapping prefix for it; easier in practice is to tunnel `:5858` and
   just re-run `yarn build` on save via a watcher.

8. **Launch the Activity in Discord** — join a voice channel in your test
   guild, click the rocket/activity icon, and pick KMQ from the list. The
   iframe should authenticate and render within a few seconds.

---

## 4. Running it in Docker

The Docker flow bundles the activity build into the image. There are two
supported paths: the compose-based scripts (recommended for dev) and the
plain `docker-build` → `docker-run` scripts (used by prod).

### 4a. docker-compose (recommended for dev)

1. Copy `docker/.env.sample` to `docker/.env` and fill in values. Note this
   is **not** the project-root `.env` — it's the one next to the compose
   file.

   ```dotenv
   BOT_TOKEN=...
   BOT_CLIENT_ID=399645526783557642
   DB_USER=root
   DB_PASS=db_pass
   DB_HOST=db
   DB_PORT=3306
   BOT_PREFIX=,
   WEB_SERVER_PORT=5858

   DISCORD_CLIENT_SECRET=...
   ACTIVITY_PUBLIC_BASE_URL=https://your-tunnel-hostname.trycloudflare.com
   ```

2. Start the stack:

   ```sh
   npm run docker-compose-dev
   ```

   The compose script:
   - Reads `docker/.env` for variable substitution in `docker-compose.yml`.
   - Forwards `BOT_CLIENT_ID` as a `--build-arg` so Vite can bake it into
     the bundle (see `docker/kmq/Dockerfile:36-37`).
   - Injects the full `.env` as runtime env for the container.
   - Forwards port `5858:5858`.

3. Tunnel `localhost:5858` with cloudflared/ngrok and register the URL
   Mappings as in section 3.

### 4b. Plain docker-build / docker-run (prod-style)

The production image is built with a plain `docker build` call that does
**not** read any env file. You must pass `BOT_CLIENT_ID` as a build arg:

```sh
# From repo root
DOCKER_BUILDKIT=1 docker build \
    -f docker/kmq/Dockerfile \
    --build-arg BOT_CLIENT_ID=399645526783557642 \
    -t ghcr.io/brainicism/kmq_discord:latest \
    .
```

Or, since `npm run docker-build` wraps `docker build`, you can append
build args to it:

```sh
npm run docker-build -- --build-arg BOT_CLIENT_ID=399645526783557642
```

Runtime config comes from the project-root `.env` when you launch via
`npm run docker-run` / `docker-run-internal`, which sources it with `.
./.env` before invoking `docker run`. Make sure the same `BOT_CLIENT_ID` is
in that file alongside `DISCORD_CLIENT_SECRET` and
`ACTIVITY_PUBLIC_BASE_URL`.

> If the iframe fails with `BOT_CLIENT_ID is not configured`, the JS
> bundle was built without the build-arg. Rebuild with `--no-cache
> --build-arg BOT_CLIENT_ID=...` — Vite bakes the value at build time, not
> runtime.

---

## 5. Deploying behind a reverse proxy

The bot's Fastify server speaks plain HTTP on `WEB_SERVER_PORT`. For
production the usual pattern is to run the bot as a container on a host
that also serves other things (e.g. the main kpop.gg website on port 80
/ 443), and fronting the whole lot with nginx.

Example nginx snippet to expose the Activity under `/activity/`:

```nginx
server {
    listen 443 ssl;
    server_name activity.example.com;

    # ... your SSL config ...

    # Activity SPA + /api/activity/* + /ws/activity
    location /activity/ {
        rewrite ^/activity/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:5858;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Required for the /ws/activity WebSocket route
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

The `rewrite ... break` strips the `/activity/` prefix so Fastify sees the
paths it registered (e.g. `/api/activity/session`), while the external URL
stays `activity.example.com/activity/...`. If you point the Discord URL
Mapping at `https://activity.example.com` (not `.../activity`), the iframe
loads at the root and everything lines up.

The existing localhost-only endpoints (`eval-central-request-handler` etc.)
keep their `request.ip !== "127.0.0.1"` guard, but the reverse proxy
should only expose `/activity/*` — do **not** proxy the whole server root
blindly.

---

## 6. Runtime flags

Activity-related feature switches live in `data/feature_switch_config.json`
and are read via `KmqConfiguration`. They can be flipped without a restart
by issuing the `reload_config` admin IPC command.

| Flag                     | Default | Effect                                                                                                                                                                                |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activityReducedEmbeds`  | `false` | When `true`, the bot replaces its in-channel round-reveal and end-of-game embeds with one-line "open the Activity" pointers. Text-channel guessing still works; the reduction is cosmetic. |

Leave the flag off if any of your users don't open the Activity — the
rich channel embeds are still the fallback. Turn it on once Activity
adoption is high enough that the channel embeds feel redundant.

---

## 7. Troubleshooting

### `BOT_CLIENT_ID is not configured`

The Vite bundle was built with an empty `BOT_CLIENT_ID`. Check which path
you used:

- Native dev: `activity/.env.local` must have `BOT_CLIENT_ID=...` **and**
  the Vite dev server (or `yarn build`) must have been restarted after the
  edit.
- `npm run docker-build`: must be invoked with `--build-arg
  BOT_CLIENT_ID=...`.
- `npm run docker-compose-*`: `docker/.env` must contain `BOT_CLIENT_ID`.

### `Token exchange failed: 500`

The server couldn't complete the OAuth `code` → `access_token` swap. Most
likely `DISCORD_CLIENT_SECRET` is unset or wrong. Confirm the value
matches the dev portal's OAuth2 client secret.

### `Not a participant of this instance` (403)

The authenticated user isn't on the Activity's participant list from
Discord's perspective. This usually means the iframe loaded for a user
who's not in the voice channel, or the instance metadata hasn't
propagated yet. Rejoining the VC and relaunching the Activity resolves it.

### Thumbnails are broken

Check DevTools → Network for the `/external/yt/...` request. If it 404s,
the dev portal URL Mapping for `/external/yt/` → `i.ytimg.com` is missing
or not yet propagated. If it's blocked by CSP, Discord hasn't whitelisted
the target — check the Mappings UI again.

### `Route GET:/?instance_id=...` 404

Fastify hasn't registered the activity SPA handler. Causes:

- The container was built without the activity build step — re-run
  `docker build` with `--no-cache`.
- The `activity/dist/` directory is missing in the built image. Check
  `docker exec <container> ls /app/activity/dist` — should show
  `index.html` and `assets/`.

### Port collisions on a shared host

When running a dev container next to a prod one, pick distinct ports with
`WEB_SERVER_PORT`. Update both `docker/.env` (for the compose port
forward) and nginx's `proxy_pass` target to match.

### Options or scoreboard not updating

Open two Activity tabs — slash-command option changes should propagate
within ~200ms via the `optionsChanged` websocket event. If one tab is
stuck, check DevTools → Network → WS for a connected `/ws/activity`
socket. A closed socket shows a disconnect banner; refresh to reconnect.
