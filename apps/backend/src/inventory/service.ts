import type { AdjustStock, CreateIngredient, Ingredient, UpdateIngredient } from '@b2b/shared';
import { notFound } from '../errors.js';
import { id, isoNow } from '../ids.js';
import type { AppRepository, StoredIngredient } from '../repositories/types.js';

export class InventoryService {
  constructor(private readonly repo: AppRepository) {}

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
}

function ingredientFromStored(ingredient: StoredIngredient): Ingredient {
  return {
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    stock: ingredient.stock,
    minStock: ingredient.minStock,
    supplier: ingredient.supplier,
    active: ingredient.active,
    isLow: ingredient.stock < ingredient.minStock,
  };
}
