import type { LedgerEntry, User } from '@b2b/shared';
import type { RecordPayment } from '@b2b/shared';
import type { LedgerResponse } from '@b2b/shared';
import { id, isoNow } from '../ids.js';
import type { AppRepository } from '../repositories/types.js';

export class LedgerService {
  constructor(private readonly repo: AppRepository) {}

  async getClientLedger(clientId: string): Promise<LedgerResponse> {
    const entries = await this.repo.listLedgerEntries(clientId);
    return { balance: this.balance(entries), entries };
  }

  async appendCharge(input: { clientId: string; orderId: string; amount: number; createdBy: string; note?: string }): Promise<LedgerEntry> {
    return this.repo.appendLedgerEntry({
      id: id('ledger'),
      clientId: input.clientId,
      orderId: input.orderId,
      type: 'charge',
      amount: input.amount,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: isoNow(),
    });
  }

  async recordPayment(clientId: string, input: RecordPayment, user: User): Promise<LedgerEntry> {
    return this.repo.appendLedgerEntry({
      id: id('ledger'),
      clientId,
      type: 'payment',
      amount: input.amount,
      method: input.method,
      note: input.note,
      createdBy: user.id,
      createdAt: isoNow(),
    });
  }

  async appendOrderPayment(input: { clientId: string; orderId: string; amount: number; method: string; createdBy: string; note?: string }): Promise<LedgerEntry> {
    return this.repo.appendLedgerEntry({
      id: id('ledger'),
      clientId: input.clientId,
      orderId: input.orderId,
      type: 'payment',
      amount: input.amount,
      method: input.method,
      note: input.note,
      createdBy: input.createdBy,
      createdAt: isoNow(),
    });
  }

  private balance(entries: LedgerEntry[]): number {
    return entries.reduce((sum, entry) => sum + (entry.type === 'charge' ? entry.amount : -entry.amount), 0);
  }
}
