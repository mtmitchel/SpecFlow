import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { specflowDir } from "./paths.js";
import { zipDirectory } from "./zip-directory.js";

const pad = (value: number): string => String(value).padStart(2, "0");

export const createStoreBackupFilename = (now: Date = new Date()): string => {
  const timestamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate())
  ].join("") + "-" + [
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds())
  ].join("");

  return `specflow-backup-${timestamp}.zip`;
};

export const saveStoreBackup = async (rootDir: string, destinationPath: string): Promise<string> => {
  const sourceDir = specflowDir(rootDir);
  const absoluteDestination = path.resolve(destinationPath);
  await mkdir(path.dirname(absoluteDestination), { recursive: true });
  const zipStream = await zipDirectory(sourceDir);
  await pipeline(zipStream, createWriteStream(absoluteDestination));
  return absoluteDestination;
};
