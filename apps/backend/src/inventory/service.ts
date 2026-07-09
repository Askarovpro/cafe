import type { AdjustStock, CreateIngredient, Ingredient, Purchase, UpdateIngredient } from '@b2b/shared';
import { notFound } from '../errors.js';
import { id, isoNow } from '../ids.js';
import type { MoneyService } from '../money/service.js';
import type { AppRepository, StoredIngredient } from '../repositories/types.js';

export class InventoryService {
  constructor(private readonly repo: AppRepository, private readonly money: MoneyService) {}

  async list(): Promise<Ingredient[]> {
    const ingredients = await this.repo.listIngredients({ activeOnly: true });
    return ingredients
      .map(ingredientFromStored)
      .sort((left, right) => Number(right.isLow) - Number(left.isLow) || left.name.localeCompare(right.name));
  }

  async create(input: CreateIngredient): Promise<Ingredient> {
    const ingredient = await this.repo.createIngredient({
      id: id('ingredient'),
      name: input.name,
      unit: input.unit,
      stock: input.stock,
      minStock: input.minStock,
      supplier: input.supplier,
      active: true,
      createdAt: isoNow(),
    });
    return ingredientFromStored(ingredient);
  }

  async update(ingredientId: string, input: UpdateIngredient): Promise<Ingredient> {
    const existing = await this.repo.findIngredientById(ingredientId);
    if (!existing) throw notFound('ingredient not found');
    return ingredientFromStored(await this.repo.updateIngredient(ingredientId, input));
  }

  async adjust(ingredientId: string, input: AdjustStock): Promise<Ingredient> {
    const existing = await this.repo.findIngredientById(ingredientId);
    if (!existing) throw notFound('ingredient not found');
    const stock = Math.max(0, existing.stock + input.delta);
    return ingredientFromStored(await this.repo.updateIngredient(ingredientId, { stock }));
  }

  async purchase(ingredientId: string, input: Purchase, createdBy: string): Promise<Ingredient> {
    const existing = await this.repo.findIngredientById(ingredientId);
    if (!existing) throw notFound('ingredient not found');

    const stock = existing.stock + input.qty;
    const price = Math.round(input.price / input.qty);
    const updated = await this.repo.updateIngredient(ingredientId, { stock, price });

    if (input.price > 0) {
      await this.money.recordExpense(
        {
          amount: input.price,
          category: 'Bozorlik',
          counterparty: existing.supplier,
          note: existing.name,
        },
        createdBy,
      );
    }

    return ingredientFromStored(updated);
  }
}

function ingredientFromStored(ingredient: StoredIngredient): Ingredient {
  return {
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    stock: ingredient.stock,
    minStock: ingredient.minStock,
    supplier: ingredient.supplier,
    price: ingredient.price,
    active: ingredient.active,
    isLow: ingredient.stock < ingredient.minStock,
  };
}
