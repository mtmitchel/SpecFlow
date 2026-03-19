import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  E2E_API_PROXY_TARGET,
  E2E_BASE_URL,
  E2E_CLIENT_PORT,
  E2E_HOST,
} from "./e2e/support/constants.ts";

const testOutputDir = path.join(os.tmpdir(), "specflow-playwright-output");

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: testOutputDir,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: E2E_BASE_URL,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "tsx e2e/support/test-server.ts",
      url: `${E2E_API_PROXY_TARGET}/api/runtime/status`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
      },
    },
    {
      command: `npm run -w @specflow/client dev -- --host ${E2E_HOST} --port ${E2E_CLIENT_PORT}`,
      url: E2E_BASE_URL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        SPECFLOW_CLIENT_HOST: E2E_HOST,
        SPECFLOW_CLIENT_PORT: String(E2E_CLIENT_PORT),
        SPECFLOW_API_PROXY_TARGET: `${E2E_API_PROXY_TARGET}`,
      },
    },
  ],
});
