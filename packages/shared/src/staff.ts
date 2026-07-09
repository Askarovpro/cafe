// Payroll — staff with a monthly salary. Advances (avans) and salary payouts are
// money-ledger EXPENSE movements from the cashbox tagged with staffId; a staff's
// balance for the month is derived. No separate advance table (old-system pattern).
import { z } from 'zod';

export interface Staff {
  id: string;
  name: string;
  position: string; // Oshpaz, Ofitsiant, Kuryer, ...
  salary: number; // monthly (UZS)
  active: boolean;
  // derived, current calendar month:
  advancesThisMonth: number; // sum of Avans payouts
  paidThisMonth: number; // Avans + Oylik payouts
  balance: number; // salary − paidThisMonth (still owed this month)
}

export enum PayoutKind {
  Advance = 'avans', // partial early payment
  Salary = 'oylik', // (remaining) monthly salary
}

export const createStaffSchema = z.object({
  name: z.string().min(1),
  position: z.string().min(1),
  salary: z.number().nonnegative(),
});
export const updateStaffSchema = createStaffSchema.partial().extend({ active: z.boolean().optional() });

export const payStaffSchema = z.object({
  kind: z.nativeEnum(PayoutKind),
  amount: z.number().positive(),
  note: z.string().optional(),
});

export type CreateStaff = z.infer<typeof createStaffSchema>;
export type UpdateStaff = z.infer<typeof updateStaffSchema>;
export type PayStaff = z.infer<typeof payStaffSchema>;
