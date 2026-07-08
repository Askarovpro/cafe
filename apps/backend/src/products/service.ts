import type { OfferedProduct } from '@b2b/shared';
import type { AppRepository } from '../repositories/types.js';

export class ProductsService {
  constructor(private readonly repo: AppRepository) {}

  async listOffered(clientId?: string): Promise<OfferedProduct[]> {
    const products = await this.repo.listProducts();
    const prices = clientId ? await this.repo.listClientPrices(clientId) : [];
    return products.map((product) => ({
      ...product,
      clientPrice: prices.find((price) => price.productId === product.id)?.price ?? null,
    }));
  }
}
