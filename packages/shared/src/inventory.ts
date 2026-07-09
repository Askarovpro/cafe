// Sklad (inventory) + Bozorlik (procurement). Ingredients with a current stock and a
// min (par) level; low stock drives the auto shopping list. Poster storage is the future
// source of truth for stock; for now the backend owns it (editable/adjustable).
import { z } from 'zod';

export interface Ingredient {
  id: string;
  name: string;
  unit: string; // kg, litr, dona, ...
  stock: number; // current quantity
  minStock: number; // par level — reorder when stock falls below this
  supplier: string; // grouping for the shopping list
  active: boolean;
  isLow: boolean; // derived: stock < minStock
}

export const createIngredientSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  stock: z.number().nonnegative().default(0),
  minStock: z.number().nonnegative().default(0),
  supplier: z.string().min(1),
});
export const updateIngredientSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  minStock: z.number().nonnegative().optional(),
  supplier: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
// Adjust stock: positive delta = kirim (received), negative = chiqim (used/write-off).
export const adjustStockSchema = z.object({
  delta: z.number(),
  reason: z.string().optional(),
});

export type CreateIngredient = z.infer<typeof createIngredientSchema>;
export type UpdateIngredient = z.infer<typeof updateIngredientSchema>;
export type AdjustStock = z.infer<typeof adjustStockSchema>;
