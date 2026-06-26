import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Vite 設定
// - tsconfig.json の paths と同期して @/* エイリアスを解決する
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
