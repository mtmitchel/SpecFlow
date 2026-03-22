import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sharedContractsPath = fileURLToPath(new URL("../app/src/shared-contracts.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@specflow/shared-contracts": sharedContractsPath,
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"]
  }
});
