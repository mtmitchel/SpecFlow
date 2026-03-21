import process from "node:process";
import path from "node:path";
import { saveStoreBackup, createStoreBackupFilename } from "../../io/store-backup.js";
import { printOutput } from "../output.js";
import type { OutputFormat } from "../types.js";

export const runBackupStoreCommand = async (options: {
  output?: string;
  format: OutputFormat;
}): Promise<void> => {
  const rootDir = process.cwd();
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.resolve(rootDir, createStoreBackupFilename());
  const savedPath = await saveStoreBackup(rootDir, outputPath);

  printOutput(options.format, { path: savedPath }, () => {
    return [
      "Backup complete",
      `path: ${savedPath}`
    ].join("\n");
  });
};
