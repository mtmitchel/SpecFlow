import process from "node:process";
import { createSpecFlowServer } from "../../server/create-server.js";
import { openBrowser } from "../../server/open-browser.js";

export const runUiCommand = async (options: { host: string; port: number; noOpen: boolean }): Promise<void> => {
  const server = await createSpecFlowServer({
    rootDir: process.cwd(),
    host: options.host,
    port: options.port
  });

  const url = await server.start();
  process.stdout.write(`SpecFlow UI running at ${url}\n`);

  if (!options.noOpen) {
    try {
      await openBrowser(url);
    } catch (error) {
      process.stderr.write(`Failed to open browser automatically: ${(error as Error).message}\n`);
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`Received ${signal}, shutting down...\n`);
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};
