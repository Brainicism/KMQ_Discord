declare namespace NodeJS {
    export interface ProcessEnv {
        BOT_TOKEN: string,
        DB_USER: string,
        DB_PASS: string,
        DB_HOST: string,
        DB_KMQ_SETTINGS_TABLE_NAME: string,
        DB_KPOP_DATA_TABLE_NAME: string,
        SONG_DOWNLOAD_DIR: string,
        RESTART_CRON?: string,
        TOP_GG_TOKEN?: string,
        DISCORD_BOTS_GG_TOKEN?: string,
        DISCORD_BOT_LIST_TOKEN?: string,
        DEBUG_SERVER_ID?: string,
        DEBUG_TEXT_CHANNEL_ID?: string,
        LOG_DIR: string,
        AOIMIRAI_DUMP_DIR: string,
        BOT_PREFIX: string
    }
}
