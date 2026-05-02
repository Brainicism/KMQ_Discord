/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Discord application ID. Must equal the server's BOT_CLIENT_ID. */
    readonly BOT_CLIENT_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
