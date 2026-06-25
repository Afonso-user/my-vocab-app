import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      manifest: false, // 用 public/manifest.json
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,woff2}"],
        runtimeCaching: [],
      },
    }),
  ],
});
