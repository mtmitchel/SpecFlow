import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const host = process.env.SPECFLOW_CLIENT_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.SPECFLOW_CLIENT_PORT ?? "5173", 10);

const clientPort = Number.isFinite(port) ? port : 5173;
const clientOrigin = `http://${host}:${clientPort}`;
const sharedContractsPath = fileURLToPath(new URL("../app/src/shared-contracts.ts", import.meta.url));

const createCsp = (mode: "dev" | "prod"): string => {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    mode === "dev"
      ? `script-src 'self' 'unsafe-eval' ${clientOrigin}`
      : "script-src 'self'",
    mode === "dev"
      ? `connect-src 'self' ${clientOrigin} ws://${host}:${clientPort}`
      : "connect-src 'self'"
  ];

  return directives.join("; ");
};

const cspMetaPlugin = (mode: "dev" | "prod") => ({
  name: "specflow-csp-meta",
  transformIndexHtml() {
    return [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: createCsp(mode)
        },
        injectTo: "head"
      }
    ];
  }
});

export default defineConfig(({ command }) => ({
  plugins: [cspMetaPlugin(command === "serve" ? "dev" : "prod")],
  resolve: {
    alias: [
      {
        find: /^@specflow\/shared-contracts$/,
        replacement: sharedContractsPath
      }
    ]
  },
  server: {
    host,
    port: clientPort
  },
  test: {
    alias: {
      "@specflow/shared-contracts": sharedContractsPath
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
}));
