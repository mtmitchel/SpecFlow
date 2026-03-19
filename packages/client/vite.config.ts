import { defineConfig } from "vite";

const host = process.env.SPECFLOW_CLIENT_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.SPECFLOW_CLIENT_PORT ?? "5173", 10);
const apiProxyTarget = process.env.SPECFLOW_API_PROXY_TARGET ?? "http://127.0.0.1:3142";

export default defineConfig({
  server: {
    host,
    port: Number.isFinite(port) ? port : 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: false
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("/react-markdown/") || id.includes("/remark-gfm/")) {
            return "markdown-vendor";
          }

          return undefined;
        }
      }
    }
  }
});
