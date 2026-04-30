import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    base: "/activity/",
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
