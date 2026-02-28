import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { writeFileAtomic, type AtomicWriteOptions } from "./atomic-write.js";

export const readYamlFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const raw = await readFile(filePath, "utf8");
    return YAML.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

export const writeYamlFile = async <T>(
  filePath: string,
  value: T,
  options: AtomicWriteOptions = {}
): Promise<void> => {
  const serialized = YAML.stringify(value);
  await writeFileAtomic(filePath, serialized, options);
};
