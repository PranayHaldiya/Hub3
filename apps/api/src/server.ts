import Fastify from "fastify";
import cookie from '@fastify/cookie';
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { fileURLToPath } from 'node:url';
import { config } from './config';
import { getDb } from './db';
import { registerRoutes, type RouteDependencies } from "./routes";

export async function buildServer(overrides?: RouteDependencies) {
  await getDb();
  const app = Fastify({ logger: true });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.HUB3_WEB_URL,
    credentials: true
  });
  await app.register(sensible);
  await registerRoutes(app, overrides);
  return app;
}

async function main() {
  const app = await buildServer();
  await app.listen({ port: 4000, host: "0.0.0.0" });
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
