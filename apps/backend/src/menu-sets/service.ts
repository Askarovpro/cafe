import type { CreateMenuSet, MenuSet, OfferedSet, UpdateMenuSet } from '@b2b/shared';
import { badRequest, notFound } from '../errors.js';
import { id, isoNow } from '../ids.js';
import type { ClientSetPrice } from '../repositories/types.js';
import type { AppRepository } from '../repositories/types.js';

export class MenuSetsService {
  constructor(private readonly repo: AppRepository) {}

  list(): Promise<MenuSet[]> {
    return this.repo.listMenuSets({ activeOnly: true });
  }

  async create(input: CreateMenuSet): Promise<MenuSet> {
    await this.requireProducts(input.components);
    return this.repo.createMenuSet({
      id: id('set'),
      name: input.name,
      description: input.description,
      basePrice: input.basePrice,
      active: true,
      components: input.components,
      createdAt: isoNow(),
    });
  }

  async update(setId: string, input: UpdateMenuSet): Promise<MenuSet> {
    const existing = await this.repo.findMenuSetById(setId);
    if (!existing) throw notFound('menu set not found');
    if (input.components) await this.requireProducts(input.components);
    return this.repo.updateMenuSet(setId, input);
  }

  async listOffered(clientId: string): Promise<OfferedSet[]> {
    await this.requireClient(clientId);
    const prices = await this.repo.listClientSetPrices(clientId);
    const sets = await this.repo.listMenuSets({ activeOnly: true });
    return sets.map((set) => ({
      ...set,
      clientPrice: prices.find((price) => price.setId === set.id)?.price ?? null,
    }));
  }

  async setClientPrice(clientId: string, setId: string, price: number): Promise<ClientSetPrice> {
    await this.requireClient(clientId);
    const set = await this.repo.findMenuSetById(setId);
    if (!set) throw notFound('menu set not found');
    return this.repo.setClientSetPrice(clientId, { setId, price });
  }

  private async requireClient(clientId: string): Promise<void> {
    if (!(await this.repo.findClientById(clientId))) throw notFound('client not found');
  }

  private async requireProducts(components: Array<{ productId: string }>): Promise<void> {
    for (const component of components) {
      if (!(await this.repo.findProductById(component.productId))) throw badRequest(`product ${component.productId} not found`);
    }
  }
}
