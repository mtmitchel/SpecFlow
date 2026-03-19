import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AtomicWriteOptions {
  simulateCrashAfterTempWrite?: boolean;
  tempSuffix?: string;
}

export class AtomicWriteCrashError extends Error {
  public readonly tmpPath: string;

  public constructor(filePath: string, tmpPath: string) {
    super(`Simulated crash after writing temporary file for ${filePath}`);
    this.name = "AtomicWriteCrashError";
    this.tmpPath = tmpPath;
  }
}

export const writeFileAtomic = async (
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {}
): Promise<void> => {
  const tempSuffix =
    options.tempSuffix ??
    (options.simulateCrashAfterTempWrite ? ".tmp" : `.tmp-${process.pid}-${randomUUID()}`);
  const tmpPath = `${filePath}${tempSuffix}`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmpPath, content, "utf8");

  if (options.simulateCrashAfterTempWrite) {
    throw new AtomicWriteCrashError(filePath, tmpPath);
  }

  await rename(tmpPath, filePath);
};
