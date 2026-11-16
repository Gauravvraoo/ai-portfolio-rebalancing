import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
const apiTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
export default defineConfig(({ mode, command }) => {
  const base = (process.env.VITE_API_BASE_URL || loadEnv(mode, process.cwd(), "").VITE_API_BASE_URL || "").trim();
  if (command === "build" && base) {
    const url = new URL(base);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      throw new Error("VITE_API_BASE_URL must be a public HTTPS origin without /api, credentials, query or fragment.");
    }
  }
  return {
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: {
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
  preview: { proxy: { "/api": { target: apiTarget, changeOrigin: true } } },
  };
});
