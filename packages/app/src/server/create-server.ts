import { mkdir } from "node:fs/promises";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { createSpecFlowRuntime } from "../runtime/create-runtime.js";
import type { CreateSpecFlowRuntimeOptions, SpecFlowRuntime } from "../runtime/types.js";
import { registerImportRoutes } from "./routes/import-routes.js";
import { registerInitiativeRoutes } from "./routes/initiative-routes.js";
import { registerOperationRoutes } from "./routes/operation-routes.js";
import { registerProviderRoutes } from "./routes/provider-routes.js";
import { registerRunAuditRoutes } from "./routes/run-audit-routes.js";
import { registerRunQueryRoutes } from "./routes/run-query-routes.js";
import { registerRuntimeRoutes } from "./routes/runtime-routes.js";
import { registerTicketRoutes } from "./routes/ticket-routes.js";
import type { SseSession } from "./sse/session.js";

export interface CreateSpecFlowServerOptions extends CreateSpecFlowRuntimeOptions {
  host?: string;
  port?: number;
  staticDir?: string;
}

export interface SpecFlowServer {
  app: FastifyInstance;
  runtime: SpecFlowRuntime;
  store: SpecFlowRuntime["store"];
  host: string;
  port: number;
  start: () => Promise<string>;
  close: () => Promise<void>;
}

export const createSpecFlowServer = async (
  options: CreateSpecFlowServerOptions
): Promise<SpecFlowServer> => {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3141;
  const staticDir = options.staticDir ?? path.join(options.rootDir, "packages", "client", "dist");
  const runtime = await createSpecFlowRuntime(options);

  await mkdir(staticDir, { recursive: true });

  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576
  });
  const verificationSubscribers = new Map<string, Set<SseSession>>();

  const broadcastVerificationEvent = (ticketId: string, event: string, payload: unknown): void => {
    const subscribers = verificationSubscribers.get(ticketId);
    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber.send(event, payload);
    }
  };

  await app.register(fastifyStatic, {
    root: staticDir,
    prefix: "/"
  });

  app.get("/", async (_request, reply) => {
    await reply.sendFile("index.html");
  });

  registerRuntimeRoutes(app, { runtime });
  registerInitiativeRoutes(app, { runtime });
  registerProviderRoutes(app, { runtime });
  registerTicketRoutes(app, {
    runtime,
    broadcastVerificationEvent,
    verificationSubscribers
  });
  registerRunQueryRoutes(app, { runtime });
  registerRunAuditRoutes(app, { runtime });
  registerOperationRoutes(app, { runtime });
  registerImportRoutes(app, { runtime });

  return {
    app,
    runtime,
    store: runtime.store,
    host,
    port,
    start: async () => {
      if (host === "0.0.0.0" || host === "::") {
        process.stderr.write(
          `[SpecFlow] WARNING: server is binding to ${host}, which exposes it to all network interfaces. ` +
          `Use 127.0.0.1 or ::1 to restrict access to localhost.\n`
        );
      }
      await app.listen({ host, port });
      return `http://${host}:${port}`;
    },
    close: async () => {
      await app.close();
      await runtime.close();
    }
  };
};
