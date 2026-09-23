import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import http from "node:http";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:8000",
        changeOrigin: true,
        // uvicorn on Windows cuts responses >~128KB short when it closes the connection, so never ask it to.
        agent: new http.Agent({ keepAlive: true }),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("Connection", "keep-alive"));
        },
      },
    },
  },
});
