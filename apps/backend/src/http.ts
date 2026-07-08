import { ZodError, type z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Role, type User } from '@b2b/shared';
import { AppError, forbidden, unauthorized } from './errors.js';
import type { AppServices } from './app-services.js';

export function parseBody<T>(schema: z.ZodType<T>, request: FastifyRequest): T {
  return schema.parse(request.body);
}

export function mapHttpError(error: unknown, _request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.code(error.statusCode).send({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    reply.code(400).send({ error: 'validation failed', issues: error.issues });
    return;
  }
  reply.code(500).send({ error: error instanceof Error ? error.message : 'internal error' });
}

export async function requireUser(request: FastifyRequest, services: AppServices): Promise<User> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) throw unauthorized();
  return services.auth.requireUserFromToken(token);
}

export function requireAnyRole(user: User, roles: Role[]): void {
  if (!roles.includes(user.role)) throw forbidden();
}
