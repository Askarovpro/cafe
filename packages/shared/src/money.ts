// Money ledger — the restaurant cash-box (kassa). Accounts + movements, derived balances.
// Adopted from the old system's MoneyAccount/MoneyMovement (trimmed for a single cafe).
// The B2B per-client debt ledger stays separate (that's receivables, not cash).
import { z } from 'zod';

export enum MoneyAccountType {
  Cashbox = 'cashbox', // singleton finance treasury ("Finansist kassasi")
  Courier = 'courier', // per driver — cash collected, not yet handed up
  Manager = 'manager', // per manager — cash received from drivers, not yet at finance
  Cashier = 'cashier', // per POS cashier — dine-in/POS cash intake
  Staff = 'staff', // per staff — payroll wallet (Phase B)
}

export enum MoneyMovementType {
  Income = 'income', // to an account (no from)
  Expense = 'expense', // from an account (no to)
  Transfer = 'transfer', // from -> to
}

export enum MoneyMovementStatus {
  Pending = 'pending', // created by giver, awaiting receiver
  Approved = 'approved', // counted; counts toward balance
  Rejected = 'rejected',
}

// Curated expense/payout categories (free string on the wire, these are the UI choices).
export const EXPENSE_CATEGORIES = ['Xarajat', 'Oylik', 'Avans', 'Postavshik', 'Boshqa'] as const;

export interface MoneyAccount {
  id: string;
  type: MoneyAccountType;
  name: string;
  ownerUserId?: string;
  balance: number; // derived from APPROVED movements
  pendingIn: number; // sum of PENDING transfers into this account
  pendingOut: number; // sum of PENDING transfers out of this account
}

export interface MoneyMovement {
  id: string;
  type: MoneyMovementType;
  status: MoneyMovementStatus;
  fromAccountId?: string;
  toAccountId?: string;
  amount: number;
  category?: string;
  note?: string;
  counterparty?: string;
  orderId?: string; // set for B2B custody movements
  createdBy: string;
  approvedBy?: string;
  createdAt: string; // ISO
  occurredAt: string; // ISO
}

// Finance dashboard rollup.
export interface MoneySummary {
  cashbox: number; // treasury balance (approved)
  drivers: number; // sum of courier balances (cash still with drivers)
  managers: number; // sum of manager balances
  pending: number; // pending transfers awaiting finance
  todayIn: number; // approved income into cashbox today
  todayOut: number; // approved expense out of cashbox today
  byDriver: { userId: string; amount: number }[]; // cash not yet in the till, per driver
}

export const recordIncomeSchema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  note: z.string().optional(),
});
export const recordExpenseSchema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  note: z.string().optional(),
  counterparty: z.string().optional(),
});
export type RecordIncome = z.infer<typeof recordIncomeSchema>;
export type RecordExpense = z.infer<typeof recordExpenseSchema>;
