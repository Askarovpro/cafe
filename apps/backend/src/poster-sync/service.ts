import type { SyncResponse } from '@b2b/shared';
import type { AppRepository, ProductUpsert } from '../repositories/types.js';
import type { PosterClient } from './poster-client.js';

export class PosterSyncService {
  constructor(
    private readonly repo: AppRepository,
    private readonly poster: PosterClient,
  ) {}

  async upsertPosterProduct(product: ProductUpsert) {
    return this.repo.upsertProduct(product);
  }

  async fullSync(): Promise<SyncResponse> {
    const products = await this.poster.getProducts();
    for (const product of products) await this.repo.upsertProduct(product);
    return { synced: products.length };
  }
}
