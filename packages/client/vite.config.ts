import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3142",
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

          if (id.includes("/mermaid/") || id.includes("/katex/")) {
            return "viz-vendor";
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
