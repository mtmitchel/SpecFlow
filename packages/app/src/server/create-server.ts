import { mkdir } from "node:fs/promises";
import path from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { BundleGenerator } from "../bundle/bundle-generator.js";
import { loadEnvironment } from "../config/env.js";
import { PlannerService } from "../planner/planner-service.js";
import { ArtifactStore } from "../store/artifact-store.js";
import { DiffEngine } from "../verify/diff-engine.js";
import { VerifierService } from "../verify/verifier-service.js";
import { registerImportRoutes } from "./routes/import-routes.js";
import { registerInitiativeRoutes } from "./routes/initiative-routes.js";
import { registerOperationRoutes } from "./routes/operation-routes.js";
import { registerProviderRoutes } from "./routes/provider-routes.js";
import { registerRunRoutes } from "./routes/run-routes.js";
import { registerRuntimeRoutes } from "./routes/runtime-routes.js";
import { registerTicketRoutes } from "./routes/ticket-routes.js";
import type { SseSession } from "./sse/session.js";

export interface CreateSpecFlowServerOptions {
  rootDir: string;
  host?: string;
  port?: number;
  staticDir?: string;
  fetchImpl?: typeof fetch;
  store?: ArtifactStore;
  plannerService?: PlannerService;
  bundleGenerator?: BundleGenerator;
  verifierService?: VerifierService;
}

export interface SpecFlowServer {
  app: FastifyInstance;
  store: ArtifactStore;
  host: string;
  port: number;
  start: () => Promise<string>;
  close: () => Promise<void>;
}

const sendNotImplemented = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  await reply.code(501).send({
    error: "Not Implemented",
    message: "This route is scaffolded and will be implemented by a later ticket"
  });
};

const registerStubbedApiRoutes = (app: FastifyInstance): void => {
  app.post("/api/runs", sendNotImplemented);
};

export const createSpecFlowServer = async (
  options: CreateSpecFlowServerOptions
): Promise<SpecFlowServer> => {
  loadEnvironment(options.rootDir);

  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3141;
  const staticDir = options.staticDir ?? path.join(options.rootDir, "packages", "client", "dist");
  const store = options.store ?? new ArtifactStore({ rootDir: options.rootDir });

  await store.initialize();

  const plannerService = options.plannerService ??
    new PlannerService({
      rootDir: options.rootDir,
      store
    });
  const bundleGenerator = options.bundleGenerator ??
    new BundleGenerator({
      rootDir: options.rootDir,
      store
    });
  const verifierService = options.verifierService ??
    new VerifierService({
      rootDir: options.rootDir,
      store
    });
  const diffEngine = new DiffEngine({ rootDir: options.rootDir });
  const fetchImpl = options.fetchImpl ?? fetch;

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

  registerRuntimeRoutes(app, { store });
  registerInitiativeRoutes(app, { plannerService, store });
  registerProviderRoutes(app, { store, fetchImpl });
  registerTicketRoutes(app, {
    bundleGenerator,
    diffEngine,
    plannerService,
    store,
    verifierService,
    broadcastVerificationEvent,
    verificationSubscribers
  });
  registerRunRoutes(app, {
    rootDir: options.rootDir,
    store,
    diffEngine
  });
  registerOperationRoutes(app, { store });
  registerImportRoutes(app, { plannerService, fetchImpl });

  registerStubbedApiRoutes(app);

  return {
    app,
    store,
    host,
    port,
    start: async () => {
      await app.listen({ host, port });
      return `http://${host}:${port}`;
    },
    close: async () => {
      await app.close();
      await store.close();
    }
  };
};
