// Menu sets (to'plam / combo) — the manager composes a named set from Poster menu items
// (products + tech cards), each with a quantity. Offered to clients at a per-client price
// like individual products. On order, a set line expands to its component products for the
// kitchen / Poster incoming order.
import { z } from 'zod';

export interface MenuSetComponent {
  productId: string; // our product id (has a posterId behind it)
  name: string;
  qty: number;
}

export interface MenuSet {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  components: MenuSetComponent[];
  active: boolean;
}

// A set enriched with the client's price. clientPrice === null => not offered to this client.
export interface OfferedSet extends MenuSet {
  clientPrice: number | null;
}

export const menuSetComponentSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive(),
});

export const createMenuSetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  basePrice: z.number().nonnegative(),
  components: z.array(menuSetComponentSchema).min(1),
});

export const updateMenuSetSchema = createMenuSetSchema.partial().extend({ active: z.boolean().optional() });

export type CreateMenuSet = z.infer<typeof createMenuSetSchema>;
export type UpdateMenuSet = z.infer<typeof updateMenuSetSchema>;
