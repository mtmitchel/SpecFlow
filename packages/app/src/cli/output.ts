import process from "node:process";
import type { OutputFormat } from "./types.js";

export const printOutput = (format: OutputFormat, payload: unknown, textRenderer: () => string): void => {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${textRenderer()}\n`);
};
