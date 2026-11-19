import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5181, proxy: { "/api": "http://localhost:5180" } },
  build: { assetsInlineLimit: 0, outDir: "dist", emptyOutDir: true },
});
