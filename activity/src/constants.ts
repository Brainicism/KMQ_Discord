// Discord Activity sandboxes the iframe; only registered URL Mappings can be
// reached. The reverse proxy at `/.proxy/*` is rewritten by the Embedded App
// SDK runtime to the developer-portal-mapped origin.
export const ACTIVITY_PROXY_BASE = "/.proxy/api/activity";
export const ACTIVITY_WS_PATH = "/.proxy/ws/activity";

// Dev portal URL Mapping forwards `/external/yt/*` → `i.ytimg.com` so YouTube
// thumbnails can render inside the iframe.
export const EXTERNAL_YOUTUBE_PROXY_PREFIX = "/external/yt/";

export const YOUTUBE_IMAGE_HOST_PATTERN =
    /^https?:\/\/(?:img\.youtube\.com|i\.ytimg\.com)\//;

export const YOUTUBE_WATCH_URL_PREFIX = "https://youtu.be/";

// Server enforces this on `/api/activity/guess`; mirror it client-side so the
// input element can refuse early.
export const MAX_GUESS_LENGTH = 500;

// Buffered guesses retained in state for the ticker. A short ring is enough —
// the ticker only renders the most recent slice.
export const RECENT_GUESS_BUFFER_LIMIT = 15;
export const RECENT_GUESS_DISPLAY_LIMIT = 8;

// Round timer ticks at whole-second resolution; 1s is enough to keep the
// displayed value fresh without excess re-renders.
export const ROUND_TIMER_TICK_MS = 1000;
