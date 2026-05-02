import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    base: "/activity/",
    // Expose BOT_CLIENT_ID to the client as `import.meta.env.BOT_CLIENT_ID`.
    // Vite's default whitelist is `VITE_*`; widening here lets the bot and
    // activity share a single env var instead of requiring a parallel
    // `VITE_DISCORD_CLIENT_ID`.
    envPrefix: ["VITE_", "BOT_CLIENT_ID"],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../src/structures"),
        },
    },
    server: {
        port: 5173,
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
});
