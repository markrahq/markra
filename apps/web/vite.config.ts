import { createMarkraAppViteConfig } from "@markra/scripts/vite";
import { VitePWA } from "vite-plugin-pwa";

export default createMarkraAppViteConfig({
  browserNodeStubUrl: new URL("../../packages/app/src/lib/browser-node-stub.ts", import.meta.url),
  packageJsonUrl: new URL("./package.json", import.meta.url),
  plugins: [
    VitePWA({
      includeAssets: ["icon-192.png", "icon-512.png"],
      injectRegister: "auto",
      manifest: {
        name: "Markra",
        short_name: "Markra",
        description: "Local-first Markdown editor",
        display: "standalone",
        start_url: "/",
        scope: "/",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      registerType: "prompt",
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        globPatterns: ["**/*.{css,html,ico,jpg,js,png,svg,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "index.html",
        skipWaiting: false
      }
    })
  ]
});
