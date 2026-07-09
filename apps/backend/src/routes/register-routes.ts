import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import {
  Role,
  copyPricesSchema,
  createClientSchema,
  createOrderSchema,
  createStaffSchema,
  payStaffSchema,
  recordExpenseSchema,
  recordIncomeSchema,
  recordPaymentSchema,
  setPriceSchema,
  telegramAuthSchema,
  transitionSchema,
  updateClientSchema,
  updateStaffSchema,
  type Subscribe,
} from '@b2b/shared';
import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../app-services.js';
import { badRequest } from '../errors.js';
import { parseBody, requireAnyRole, requireUser } from '../http.js';

type Sock = { readyState: number; OPEN: number; send(data: string): void; on(ev: string, cb: (...args: any[]) => void): void };

export async function registerRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get('/ws', { websocket: true }, (socket: Sock) => {
    socket.on('message', (raw: Buffer) => {
      const subscription = JSON.parse(raw.toString()) as Subscribe;
      services.hub.subscribe(socket, subscription);
    });
    socket.on('close', () => services.hub.unsubscribe(socket));
  });

  app.post('/auth/telegram', async (request, reply) => {
    const { initData } = parseBody(telegramAuthSchema, request);
    return reply.send(await services.auth.loginTelegram(initData));
  });

  app.get('/products', async (request) => {
    const { clientId } = request.query as { clientId?: string };
    return services.products.listOffered(clientId);
  });

  app.post('/poster/webhook', async (request) => {
    await services.posterSync.upsertPosterProduct(normalizePosterWebhook(request.body));
    return { ok: true };
  });

  app.post('/admin/sync/products', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Manager, Role.Owner]);
    return services.posterSync.fullSync();
  });

  app.get('/clients', async (request) => {
    await requireUser(request, services);
    return services.clients.list();
  });
  app.post('/clients', async (request, reply) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Manager]);
    return reply.code(201).send(await services.clients.create(parseBody(createClientSchema, request)));
  });
  app.get('/clients/:id', async (request) => {
    await requireUser(request, services);
    return services.clients.get((request.params as { id: string }).id);
  });
  app.patch('/clients/:id', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Manager]);
    return services.clients.update((request.params as { id: string }).id, parseBody(updateClientSchema, request));
  });

  app.get('/clients/:id/prices', async (request) => {
    await requireUser(request, services);
    return services.pricing.listClientPrices((request.params as { id: string }).id);
  });
  app.put('/clients/:id/prices/:productId', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Manager]);
    const { id, productId } = request.params as { id: string; productId: string };
    const { price } = parseBody(setPriceSchema, request);
    return services.pricing.setClientPrice(id, productId, price);
  });
  app.post('/clients/:id/prices/copy', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Manager]);
    const { fromClientId } = parseBody(copyPricesSchema, request);
    return services.pricing.copyClientPrices((request.params as { id: string }).id, fromClientId);
  });
  app.post('/clients/:id/prices/base', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Manager]);
    return services.pricing.seedClientPricesFromBase((request.params as { id: string }).id);
  });

  app.get('/clients/:id/ledger', async (request) => {
    await requireUser(request, services);
    return services.ledger.getClientLedger((request.params as { id: string }).id);
  });
  app.post('/clients/:id/payments', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Manager]);
    return services.ledger.recordPayment((request.params as { id: string }).id, parseBody(recordPaymentSchema, request), user);
  });

  app.get('/orders', async (request) => {
    const user = await requireUser(request, services);
    const query = request.query as { status?: string; mine?: string };
    return services.orders.list({ status: query.status, mine: query.mine === 'true' }, user);
  });
  app.post('/orders', async (request, reply) => {
    const user = await requireUser(request, services);
    return reply.code(201).send(await services.orders.create(parseBody(createOrderSchema, request), user));
  });
  app.get('/orders/:id', async (request) => {
    await requireUser(request, services);
    return services.orders.get((request.params as { id: string }).id);
  });
  app.post('/orders/:id/transition', async (request) => {
    const user = await requireUser(request, services);
    return services.orders.transition((request.params as { id: string }).id, parseBody(transitionSchema, request), user);
  });

  app.get('/money/accounts', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance, Role.Owner]);
    return services.money.getAccounts();
  });
  app.get('/money/movements', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance, Role.Owner]);
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : undefined;
    return services.money.getMovements({ limit: Number.isFinite(limit) ? limit : undefined });
  });
  app.get('/money/summary', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance, Role.Owner]);
    return services.money.getSummary();
  });
  app.post('/money/income', async (request, reply) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance]);
    return reply.code(201).send(await services.money.recordIncome(parseBody(recordIncomeSchema, request), user.id));
  });
  app.post('/money/expense', async (request, reply) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance]);
    return reply.code(201).send(await services.money.recordExpense(parseBody(recordExpenseSchema, request), user.id));
  });

  app.get('/staff', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance]);
    return services.staff.list();
  });
  app.post('/staff', async (request, reply) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance]);
    return reply.code(201).send(await services.staff.create(parseBody(createStaffSchema, request)));
  });
  app.patch('/staff/:id', async (request) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance]);
    return services.staff.update((request.params as { id: string }).id, parseBody(updateStaffSchema, request));
  });
  app.post('/staff/:id/pay', async (request, reply) => {
    const user = await requireUser(request, services);
    requireAnyRole(user, [Role.Finance]);
    return reply.code(201).send(await services.staff.pay((request.params as { id: string }).id, parseBody(payStaffSchema, request), user.id));
  });
}

function normalizePosterWebhook(body: unknown) {
  const source = (typeof body === 'object' && body && 'product' in body ? (body as { product: unknown }).product : body) as Record<string, unknown>;
  const posterId = source.posterId ?? source.product_id ?? source.id;
  if (!posterId) throw badRequest('poster product id missing');
  return {
    posterId: String(posterId),
    name: String(source.name ?? source.product_name ?? ''),
    category: String(source.category ?? source.category_name ?? ''),
    basePrice: Number(source.basePrice ?? source.price ?? 0),
    cost: Number(source.cost ?? 0),
    unit: String(source.unit ?? 'pcs'),
    isStopped: Boolean(source.isStopped ?? source.hidden ?? source.is_stopped ?? false),
  };
}
