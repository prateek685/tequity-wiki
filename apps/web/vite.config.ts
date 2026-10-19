import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev only: the API the dev server forwards /api to (apps/web/.env). Not exposed to the browser bundle.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4101";
const WEB_PORT = Number(process.env.WEB_PORT ?? 4100);

export default defineConfig({
  // The router plugin must run before the React plugin (it generates src/routeTree.gen.ts).
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Routes are code-split, so Vite would only find their dependencies (e.g. react-markdown) on first
  // visit and then reload the page. Scanning every source file at start-up avoids that.
  optimizeDeps: { entries: ["src/**/*.tsx"] },
  server: {
    port: WEB_PORT,
    strictPort: true,
    // Same origin in development too: the browser only ever talks to :4100.
    proxy: { "/api": { target: API_PROXY_TARGET } },
  },
  preview: { port: WEB_PORT, strictPort: true, proxy: { "/api": { target: API_PROXY_TARGET } } },
  build: {
    target: "es2023",
    sourcemap: true,
  },
});
