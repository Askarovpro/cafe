import Fastify from 'fastify';
import { createAppServices } from './app-services.js';
import { readEnv, type Env } from './config/env.js';
import { GrammyNotifier, NoopNotifier } from './delivery/notifier.js';
import { mapHttpError } from './http.js';
import { FakePosterClient, HttpPosterClient } from './poster-sync/poster-client.js';
import { MemoryRepository } from './repositories/memory.js';
import { createPostgresRepository } from './repositories/postgres.js';
import type { AppRepository } from './repositories/types.js';
import { registerRoutes } from './routes/register-routes.js';

export async function buildServer(options: { env?: Env; repo?: AppRepository } = {}) {
  const env = options.env ?? readEnv();
  const repo = options.repo ?? (env.databaseUrl ? createPostgresRepository(env.databaseUrl) : new MemoryRepository());
  const poster = env.posterToken ? new HttpPosterClient(env.posterToken, env.posterSpotId) : new FakePosterClient();
  const notifier = env.botToken
    ? new GrammyNotifier(env.botToken, async (userId) => (await repo.findUserById(userId))?.telegramId)
    : new NoopNotifier();
  const services = createAppServices({
    repo,
    poster,
    botToken: env.botToken,
    jwtSecret: env.jwtSecret,
    devAuth: env.devAuth,
    notifier,
  });

  const app = Fastify({ logger: true });
  app.setErrorHandler(mapHttpError);
  await registerRoutes(app, services);
  return { app, services };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = readEnv();
  const { app } = await buildServer({ env });
  await app.listen({ port: env.port, host: '0.0.0.0' });
}
