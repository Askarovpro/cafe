import type { ClientPrice } from '@b2b/shared';
import { notFound } from '../errors.js';
import type { AppRepository } from '../repositories/types.js';

export class PricingService {
  constructor(private readonly repo: AppRepository) {}

  listClientPrices(clientId: string): Promise<ClientPrice[]> {
    return this.repo.listClientPrices(clientId);
  }

  async setClientPrice(clientId: string, productId: string, price: number): Promise<ClientPrice> {
    await this.requireClient(clientId);
    const product = await this.repo.findProductById(productId);
    if (!product) throw notFound('product not found');
    return this.repo.setClientPrice(clientId, { productId, price });
  }

  async copyClientPrices(clientId: string, fromClientId: string): Promise<ClientPrice[]> {
    await this.requireClient(clientId);
    await this.requireClient(fromClientId);
    const prices = await this.repo.listClientPrices(fromClientId);
    return this.repo.replaceClientPrices(clientId, prices);
  }

  async seedClientPricesFromBase(clientId: string): Promise<ClientPrice[]> {
    await this.requireClient(clientId);
    const prices = (await this.repo.listProducts()).map((product) => ({ productId: product.id, price: product.basePrice }));
    return this.repo.replaceClientPrices(clientId, prices);
  }

  private async requireClient(clientId: string): Promise<void> {
    if (!(await this.repo.findClientById(clientId))) throw notFound('client not found');
  }
}
