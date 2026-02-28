import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ZipFile } from "yazl";

export const zipDirectory = async (directory: string): Promise<NodeJS.ReadableStream> => {
  const zip = new ZipFile();
  await addDirectoryToZip(zip, directory, "");
  zip.end();
  return zip.outputStream;
};

const addDirectoryToZip = async (zip: ZipFile, absoluteDir: string, relativeBase: string): Promise<void> => {
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = path.posix.join(relativeBase, entry.name);

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, absolutePath, relativePath);
      continue;
    }

    const meta = await stat(absolutePath);
    if (meta.isFile()) {
      zip.addFile(absolutePath, relativePath);
    }
  }
};
