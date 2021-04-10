// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare namespace NodeJS {
    export interface ProcessEnv {
        BOT_TOKEN: string,
        DB_USER: string,
        DB_PASS: string,
        DB_HOST: string,
        DB_PORT: string,
        SONG_DOWNLOAD_DIR: string,
        RESTART_CRON?: string,
        TOP_GG_TOKEN?: string,
        DISCORD_BOTS_GG_TOKEN?: string,
        DISCORD_BOT_LIST_TOKEN?: string,
        DEBUG_SERVER_ID?: string,
        DEBUG_TEXT_CHANNEL_ID?: string,
        BOT_PREFIX: string,
        NODE_ENV: string,
    }
}
