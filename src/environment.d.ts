declare namespace NodeJS {
    export interface ProcessEnv {
        BOT_TOKEN: string,
        DB_USER: string,
        DB_PASS: string,
        DB_HOST: string,
        DB_PORT: string,
        SONG_DOWNLOAD_DIR: string,
        TOP_GG_TOKEN?: string,
        TOP_GG_WEBHOOK_AUTH?: string,
        DISCORD_BOTS_GG_TOKEN?: string,
        DISCORD_BOT_LIST_TOKEN?: string,
        DEBUG_SERVER_ID?: string,
        DEBUG_TEXT_CHANNEL_ID?: string,
        BOT_PREFIX: string,
        NODE_ENV: string,
        WEB_SERVER_IP: string,
        WEB_SERVER_PORT: string,
        ALERT_WEBHOOK_URL?: string,
        AUDIO_SONGS_PER_ARTIST: number,
        PREMIUM_AUDIO_SONGS_PER_ARTIST: number,
    }
}
