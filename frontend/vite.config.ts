import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to the FastAPI server, so the browser sees one origin (no CORS).
// Tailwind runs through PostCSS (postcss.config.js). Everything here is pure JS / WebAssembly,
// so it also works on machines whose Windows Application Control blocks native .node/.exe files.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
  },
});
