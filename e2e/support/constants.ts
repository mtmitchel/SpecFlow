import os from "node:os";
import path from "node:path";

export const E2E_HOST = "127.0.0.1";
export const E2E_SERVER_PORT = 4142;
export const E2E_CLIENT_PORT = 4173;
export const E2E_ROOT_DIR = path.join(os.tmpdir(), "specflow-playwright-runtime");
export const E2E_STATIC_DIR = path.join(E2E_ROOT_DIR, "packages", "client", "dist");
export const E2E_NOTE_FILE = "src/note-store.ts";
export const E2E_NOTE_FILE_PATH = path.join(E2E_ROOT_DIR, E2E_NOTE_FILE);
export const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_CLIENT_PORT}`;
export const E2E_API_PROXY_TARGET = `http://${E2E_HOST}:${E2E_SERVER_PORT}`;
