import { AuthService } from './auth/service.js';
import { ClientsService } from './clients/service.js';
import { NoopNotifier, type Notifier } from './delivery/notifier.js';
import { LedgerService } from './ledger/service.js';
import { OrdersService } from './orders/service.js';
import type { PosterClient } from './poster-sync/poster-client.js';
import { PosterSyncService } from './poster-sync/service.js';
import { PricingService } from './pricing/service.js';
import { ProductsService } from './products/service.js';
import { RealtimeHub } from './realtime/hub.js';
import type { AppRepository } from './repositories/types.js';

export type AppServices = ReturnType<typeof createAppServices>;

export function createAppServices(input: {
  repo: AppRepository;
  poster: PosterClient;
  botToken: string;
  jwtSecret: string;
  devAuth?: boolean;
  notifier?: Notifier;
  hub?: RealtimeHub;
}) {
  const hub = input.hub ?? new RealtimeHub();
  const notifier = input.notifier ?? new NoopNotifier();
  const ledger = new LedgerService(input.repo);
  return {
    auth: new AuthService(input.repo, input.botToken, input.jwtSecret, input.devAuth ?? false),
    clients: new ClientsService(input.repo),
    ledger,
    orders: new OrdersService(input.repo, ledger, input.poster, notifier, hub),
    posterSync: new PosterSyncService(input.repo, input.poster),
    pricing: new PricingService(input.repo),
    products: new ProductsService(input.repo),
    hub,
    repo: input.repo,
  };
}
