# KMQ Web (standalone website)

KMQ Web is the full game running in a plain browser tab — no Discord client
required. Players log in with Discord OAuth, group up in shareable
multiplayer rooms, and the song audio is streamed to the browser. It is the
same server and the same SPA bundle as the [Discord Activity](ACTIVITY.md);
the bundle detects at load time whether it's inside Discord's iframe or on
the open web.

This document covers:

1. [How it fits together](#1-how-it-fits-together)
2. [Discord developer portal configuration](#2-discord-developer-portal-configuration)
3. [Environment variables](#3-environment-variables)
4. [Turning it on](#4-turning-it-on)
5. [Rooms](#5-rooms)
6. [Audio streaming](#6-audio-streaming)
7. [Analytics note](#7-analytics-note)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. How it fits together

- `/play` (and `/play/*`) serve the SPA. On the open web the landing page
  (login / create / join room) mounts instead of the Activity shell.
- `/play/r/<code>` is a room invite link; visiting it while logged in joins
  the room.
- `/api/web/*` are the web-only routes: OAuth login
  (`login`, `callback`, `complete-login`, `session`, `logout`), rooms
  (`room`, `room/join`, `room/leave`), and the audio stream
  (`audio/:token`).
- All gameplay goes through the **same** `/api/activity/*` + `/ws/activity`
  routes as the embedded Activity — the room's invite code stands in for the
  Activity `instance_id`, and a `web_`-prefixed bearer token (backed by the
  `web_sessions` table, 30-day sliding expiry, sha256-hashed at rest) stands
  in for the Discord OAuth access token.
- Game sessions for rooms run as headless `WebGameSession`s on the cluster
  workers: real `GameSession` logic (EXP, stats, presets, every option), no
  voice channel, round end driven by a timer instead of the voice stream.

## 2. Discord developer portal configuration

One addition on top of the [Activity setup](ACTIVITY.md#1-discord-developer-portal-configuration):

- **OAuth2 → Redirects**: add the exact callback URL
  `https://<your-web-origin>/api/web/callback`.

Unlike the Activity (which only needs the origin), the web login is a
standard OAuth redirect flow, so the redirect URI must match **exactly**,
path included. Only the `identify` scope is requested.

## 3. Environment variables

| Var                     | Where it's read | Value                                                                                                   |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `WEB_PUBLIC_BASE_URL`   | Server only     | Public HTTPS origin of the website, no trailing `/`. Falls back to `ACTIVITY_PUBLIC_BASE_URL` if unset. |
| `BOT_CLIENT_ID`         | Server + bundle | Same as the Activity.                                                                                   |
| `DISCORD_CLIENT_SECRET` | Server only     | Same as the Activity.                                                                                   |
| `WEB_SERVER_PORT`       | Server only     | Same Fastify server as the Activity/status pages.                                                       |

No new build-time vars: the login URL is built server-side, so a web-only
deployment doesn't need `BOT_CLIENT_ID` baked into the bundle.

## 4. Turning it on

Web mode ships **off**. Every `/api/web/*` route (and the web branch of
`/api/activity/start`) returns `503 {"error": "Web mode disabled"}` until the
`webModeEnabled` feature switch is flipped in
`data/feature_switch_config.json`:

```json
{ "webModeEnabled": true }
```

Feature switches hot-reload (cron on the admiral, `reload_config` IPC on
workers), so flipping the file enables the site within a minute — no restart
or deploy. Flip it back to shed the web surface instantly while leaving the
Activity and the bot untouched.

## 5. Rooms

- A room is identified by an unguessable invite code; internally it maps to a
  synthetic guild ID `(1 << 62) | ownerUserID`. The ID is deterministic per
  owner, so a recreated room keeps its game options, presets, and unique-song
  history.
- One active room per owner; 8 members max; solo play is a room of one.
- Presence is derived from the game websocket: a member whose socket stays
  closed for 60s is dropped, ownership transfers on leave, and an empty room
  is closed (ending any running game).
- Rooms live in admiral memory: an admiral restart drops room membership
  (players just create/join again — options and presets survive via the
  deterministic ID).

### Guests

- With the `webGuestsEnabled` feature switch on (in addition to
  `webModeEnabled`), visitors without a Discord account can pick a nickname
  and play. It hot-reloads like every other switch, so the free-identity
  surface can be shed instantly without taking down the site.
- Guests can **join** rooms (via invite link or code) but never host: room
  creation returns `403 {"error": "guest_forbidden"}` and the UI doesn't
  offer it. Hosting stays tied to Discord accounts, which keeps persistent
  per-owner state (options, presets) and the room-ID scheme meaningful, and
  caps the abuse value of free identities.
- A guest is a synthetic numeric user ID with bits 62+61 set (disjoint from
  real snowflakes and from room guild IDs) on a normal `web_sessions` row —
  everything downstream (guessing, EXP, scoreboards) treats it like any
  player. The identity is ephemeral by design: logging out (or the 30-day
  session TTL) orphans it, and any stats it accrued stay behind under an ID
  that can never be logged into again. `user_id >= 6917529027641081856`
  (2^62 + 2^61) identifies guest rows when querying.

## 6. Audio streaming

- The worker never tells clients what song is playing pre-reveal. The
  playback spec stops at the admiral, which mints an opaque single-playback
  token; browsers only ever see `/api/web/audio/<token>`.
- Each `GET` spawns a dedicated `ffmpeg` that re-runs the round's exact
  playback args (seek, clip bounds, special-mode filters) and trims the
  output to the wall-clock live position — so reloads and late joiners are
  always in sync, including for tempo-warped and reversed special modes.
- Output is chunked MP3 (`libmp3lame`, 128k): plays natively in every
  browser including iOS Safari, no MSE required.
- Tokens die with the playback (each clip replay / next round mints a new
  one), on session end, and on a TTL sweep. Concurrent transcodes are capped
  (`WEB_AUDIO_MAX_CONCURRENT_STREAMS`); encode runs much faster than
  realtime, so processes live seconds, not song-lengths.
- Browsers block un-gestured audio: the site shows an "Enable sound" pill
  until the player clicks it once. Volume/mute persist in `localStorage`.

## 7. Analytics note

Web rooms flow through every guild-keyed table with their synthetic guild
IDs. When querying, `guild_id >= 4611686018427387904` (2^62) means "web
room"; real Discord snowflakes won't reach that bit until ~2049. E.g.:

```sql
-- Web-room game sessions
SELECT COUNT(*) FROM game_sessions WHERE CAST(guild_id AS UNSIGNED) >= 1 << 62;
```

## 8. Troubleshooting

### Everything returns `503 {"error": "Web mode disabled"}`

The `webModeEnabled` feature switch is off — see [Turning it on](#4-turning-it-on).

### Discord shows "Invalid OAuth2 redirect_uri" at login

The exact URL `<WEB_PUBLIC_BASE_URL>/api/web/callback` isn't registered
under OAuth2 → Redirects (or `WEB_PUBLIC_BASE_URL` disagrees with the origin
you're browsing).

### Login redirects back but the page says login failed

The one-time login code expired (60s) or the server restarted between
callback and exchange (login codes are in-memory). Log in again.

### No sound

Click the "Enable sound" pill (bottom-left) — browsers refuse autoplay
until a user gesture. If it persists, check the `/api/web/audio/<token>`
request: `404` = stale token (reconnect re-syncs via the snapshot), `410` =
playback already over, `503` = stream cap reached.

### Thumbnails are broken

On the web the SPA loads `i.ytimg.com` directly (no Discord proxy). If they
fail, something upstream (CSP header, adblock) is blocking that host.
