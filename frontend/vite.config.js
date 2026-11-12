import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const apiTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
export default defineConfig({
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
});
