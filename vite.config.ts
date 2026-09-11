import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @see https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  // Excalidraw's bundle reads this flag at runtime; Vite has no process.env.
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "chrome105",
    sourcemap: true,
  },
});
