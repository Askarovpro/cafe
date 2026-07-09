// Frozen B2B contract — Zod schemas for request validation. Backend validates with these.

import { z } from 'zod';
import { DeliveryType, OrderAction, PaymentType } from './enums.js';

export const clientLocationSchema = z.object({
  label: z.string().min(1),
  address: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const createClientSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  locations: z.array(clientLocationSchema).min(1),
  notes: z.string().optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const setPriceSchema = z.object({ price: z.number().nonnegative() });

export const copyPricesSchema = z.object({ fromClientId: z.string().min(1) });

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
  note: z.string().optional(),
});

export const createOrderSchema = z.object({
  clientId: z.string().min(1),
  // each line references a product OR a set (exactly one)
  items: z.array(
    z.object({ productId: z.string().optional(), setId: z.string().optional(), qty: z.number().positive() })
      .refine((it) => !!it.productId !== !!it.setId, { message: 'each item needs exactly one of productId or setId' }),
  ).min(1),
  portions: z.number().int().positive(),
  location: clientLocationSchema,
  contactPhone: z.string().min(1),
  paymentType: z.nativeEnum(PaymentType),
  notes: z.string().optional(),
});

// Transition body. Extra fields are action-specific and validated per-action by the backend.
export const transitionSchema = z.object({
  action: z.nativeEnum(OrderAction),
  deliveryType: z.nativeEnum(DeliveryType).optional(), // Assign
  driverId: z.string().optional(), // Assign (own_driver)
  cashCollected: z.boolean().optional(), // Deliver
});

export const telegramAuthSchema = z.object({ initData: z.string().min(1) });

export type CreateClient = z.infer<typeof createClientSchema>;
export type UpdateClient = z.infer<typeof updateClientSchema>;
export type SetPrice = z.infer<typeof setPriceSchema>;
export type CopyPrices = z.infer<typeof copyPricesSchema>;
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export type CreateOrder = z.infer<typeof createOrderSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type TelegramAuth = z.infer<typeof telegramAuthSchema>;
