import {
  MoneyAccountType,
  MoneyMovementStatus,
  MoneyMovementType,
  PaymentType,
  type MoneyAccount,
  type MoneyMovement,
  type MoneySummary,
  type Order,
  type RecordExpense,
  type RecordIncome,
} from '@b2b/shared';
import { badRequest, conflict, notFound } from '../errors.js';
import { id, isoNow } from '../ids.js';
import type { AppRepository, StoredMoneyAccount, StoredMoneyMovement } from '../repositories/types.js';

type CreateMovementInput = {
  type: MoneyMovementType;
  status?: MoneyMovementStatus;
  fromAccountId?: string;
  toAccountId?: string;
  amount: number;
  category?: string;
  note?: string;
  counterparty?: string;
  orderId?: string;
  createdBy: string;
  approvedBy?: string;
  occurredAt?: string;
};

type Balances = Record<string, Pick<MoneyAccount, 'balance' | 'pendingIn' | 'pendingOut'>>;

const ACCOUNT_SUFFIX: Record<Exclude<MoneyAccountType, MoneyAccountType.Cashbox>, string> = {
  [MoneyAccountType.Courier]: 'courier',
  [MoneyAccountType.Manager]: 'manager',
  [MoneyAccountType.Cashier]: 'cashier',
  [MoneyAccountType.Staff]: 'staff',
};

export class MoneyService {
  constructor(private readonly repo: AppRepository) {}

  async getOrCreateAccount(type: MoneyAccountType, ownerUserId?: string): Promise<StoredMoneyAccount> {
    if (type === MoneyAccountType.Cashbox) {
      const existing = await this.repo.findMoneyAccount({ type });
      if (existing) return existing;
      return this.repo.createMoneyAccount({
        id: id('money_account'),
        type,
        name: 'Kassa',
        createdAt: isoNow(),
      });
    }

    if (!ownerUserId) throw badRequest(`${type} account requires ownerUserId`);
    const existing = await this.repo.findMoneyAccount({ type, ownerUserId });
    if (existing) return existing;

    const user = await this.repo.findUserById(ownerUserId);
    const baseName = user?.name ?? ownerUserId;
    return this.repo.createMoneyAccount({
      id: id('money_account'),
      type,
      name: `${baseName} (${ACCOUNT_SUFFIX[type]})`,
      ownerUserId,
      createdAt: isoNow(),
    });
  }

  async createMovement(input: CreateMovementInput): Promise<MoneyMovement> {
    this.validateMovement(input);
    await this.validateAccountsExist(input);

    const now = isoNow();
    const movement: StoredMoneyMovement = {
      id: id('money_movement'),
      type: input.type,
      status: input.status ?? MoneyMovementStatus.Pending,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      category: input.category,
      note: input.note,
      counterparty: input.counterparty,
      orderId: input.orderId,
      createdBy: input.createdBy,
      approvedBy: input.approvedBy,
      createdAt: now,
      occurredAt: input.occurredAt ?? now,
    };
    return this.repo.createMoneyMovement(movement);
  }

  async approveMovement(movementId: string, approverUserId: string): Promise<MoneyMovement> {
    const movement = await this.repo.findMoneyMovementById(movementId);
    if (!movement) throw notFound('money movement not found');
    if (movement.status === MoneyMovementStatus.Approved) return movement;
    if (movement.status !== MoneyMovementStatus.Pending) throw conflict('only pending money movements can be approved');
    return this.repo.updateMoneyMovement({
      ...movement,
      status: MoneyMovementStatus.Approved,
      approvedBy: approverUserId,
    });
  }

  async calculateBalances(): Promise<Balances> {
    const accounts = await this.repo.listMoneyAccounts();
    const balances = Object.fromEntries(accounts.map((account) => [account.id, { balance: 0, pendingIn: 0, pendingOut: 0 }])) as Balances;
    const movements = await this.repo.listMoneyMovements();

    for (const movement of movements) {
      if (movement.status === MoneyMovementStatus.Approved) {
        if (movement.toAccountId && balances[movement.toAccountId]) balances[movement.toAccountId].balance += movement.amount;
        if (movement.fromAccountId && balances[movement.fromAccountId]) balances[movement.fromAccountId].balance -= movement.amount;
      }
      if (movement.status === MoneyMovementStatus.Pending) {
        if (movement.toAccountId && balances[movement.toAccountId]) balances[movement.toAccountId].pendingIn += movement.amount;
        if (movement.fromAccountId && balances[movement.fromAccountId]) balances[movement.fromAccountId].pendingOut += movement.amount;
      }
    }

    return balances;
  }

  async getAccounts(): Promise<MoneyAccount[]> {
    await this.getOrCreateAccount(MoneyAccountType.Cashbox);
    const accounts = await this.repo.listMoneyAccounts();
    const balances = await this.calculateBalances();
    return accounts.map((account) => ({
      id: account.id,
      type: account.type,
      name: account.name,
      ownerUserId: account.ownerUserId,
      balance: balances[account.id]?.balance ?? 0,
      pendingIn: balances[account.id]?.pendingIn ?? 0,
      pendingOut: balances[account.id]?.pendingOut ?? 0,
    }));
  }

  async getMovements(query: { limit?: number } = {}): Promise<MoneyMovement[]> {
    return this.repo.listMoneyMovements({ limit: query.limit });
  }

  async getSummary(): Promise<MoneySummary> {
    const cashbox = await this.getOrCreateAccount(MoneyAccountType.Cashbox);
    const accounts = await this.getAccounts();
    const movements = await this.repo.listMoneyMovements();
    const cashboxAccount = accounts.find((account) => account.id === cashbox.id);
    const courierAccounts = accounts.filter((account) => account.type === MoneyAccountType.Courier);
    const managerAccounts = accounts.filter((account) => account.type === MoneyAccountType.Manager);
    const { start, end } = todayBounds();

    return {
      cashbox: cashboxAccount?.balance ?? 0,
      drivers: courierAccounts.reduce((sum, account) => sum + account.balance, 0),
      managers: managerAccounts.reduce((sum, account) => sum + account.balance, 0),
      pending: movements
        .filter(
          (movement) =>
            movement.status === MoneyMovementStatus.Pending &&
            movement.type === MoneyMovementType.Transfer &&
            movement.toAccountId === cashbox.id,
        )
        .reduce((sum, movement) => sum + movement.amount, 0),
      todayIn: movements
        .filter(
          (movement) =>
            movement.status === MoneyMovementStatus.Approved &&
            movement.type === MoneyMovementType.Income &&
            movement.toAccountId === cashbox.id &&
            isWithin(movement.occurredAt, start, end),
        )
        .reduce((sum, movement) => sum + movement.amount, 0),
      todayOut: movements
        .filter(
          (movement) =>
            movement.status === MoneyMovementStatus.Approved &&
            movement.type === MoneyMovementType.Expense &&
            movement.fromAccountId === cashbox.id &&
            isWithin(movement.occurredAt, start, end),
        )
        .reduce((sum, movement) => sum + movement.amount, 0),
      byDriver: courierAccounts
        .filter((account) => account.ownerUserId)
        .map((account) => ({ userId: account.ownerUserId!, amount: account.balance })),
    };
  }

  async recordIncome(input: RecordIncome, createdBy: string): Promise<MoneyMovement> {
    const cashbox = await this.getOrCreateAccount(MoneyAccountType.Cashbox);
    return this.createMovement({
      type: MoneyMovementType.Income,
      status: MoneyMovementStatus.Approved,
      toAccountId: cashbox.id,
      amount: input.amount,
      category: input.category,
      note: input.note,
      createdBy,
      approvedBy: createdBy,
    });
  }

  async recordExpense(input: RecordExpense, createdBy: string): Promise<MoneyMovement> {
    const cashbox = await this.getOrCreateAccount(MoneyAccountType.Cashbox);
    return this.createMovement({
      type: MoneyMovementType.Expense,
      status: MoneyMovementStatus.Approved,
      fromAccountId: cashbox.id,
      amount: input.amount,
      category: input.category,
      note: input.note,
      counterparty: input.counterparty,
      createdBy,
      approvedBy: createdBy,
    });
  }

  async recordOrderCashDelivery(order: Order, createdBy: string): Promise<void> {
    if (order.paymentType !== PaymentType.Cash) return;
    if (!order.driverId) throw badRequest('cash order delivery requires driverId');
    const courier = await this.getOrCreateAccount(MoneyAccountType.Courier, order.driverId);
    const existing = (await this.repo.listMoneyMovements({ orderId: order.id })).find(
      (movement) => movement.type === MoneyMovementType.Income && movement.toAccountId === courier.id,
    );
    if (existing) return;
    await this.createMovement({
      type: MoneyMovementType.Income,
      status: MoneyMovementStatus.Approved,
      toAccountId: courier.id,
      amount: order.total,
      category: 'B2B naqd',
      orderId: order.id,
      createdBy,
      approvedBy: createdBy,
    });
  }

  async recordOrderCashToManager(order: Order, createdBy: string): Promise<void> {
    if (order.paymentType !== PaymentType.Cash) return;
    if (!order.driverId) throw badRequest('cash handoff requires driverId');
    const courier = await this.getOrCreateAccount(MoneyAccountType.Courier, order.driverId);
    const manager = await this.getOrCreateAccount(MoneyAccountType.Manager, order.createdBy);
    await this.ensureOrderTransfer(order, courier.id, manager.id, MoneyMovementStatus.Approved, createdBy);
  }

  async recordOrderCashToFinance(order: Order, createdBy: string): Promise<void> {
    if (order.paymentType !== PaymentType.Cash) return;
    const manager = await this.getOrCreateAccount(MoneyAccountType.Manager, order.createdBy);
    const cashbox = await this.getOrCreateAccount(MoneyAccountType.Cashbox);
    await this.ensureOrderTransfer(order, manager.id, cashbox.id, MoneyMovementStatus.Pending, createdBy);
  }

  async approveOrderCashboxTransfer(order: Order, approverUserId: string): Promise<void> {
    if (order.paymentType !== PaymentType.Cash) return;
    const cashbox = await this.getOrCreateAccount(MoneyAccountType.Cashbox);
    const movements = await this.repo.listMoneyMovements({ orderId: order.id });
    const approved = movements.find(
      (movement) =>
        movement.type === MoneyMovementType.Transfer &&
        movement.toAccountId === cashbox.id &&
        movement.status === MoneyMovementStatus.Approved,
    );
    if (approved) return;
    const pending = movements.find(
      (movement) =>
        movement.type === MoneyMovementType.Transfer &&
        movement.toAccountId === cashbox.id &&
        movement.status === MoneyMovementStatus.Pending,
    );
    if (!pending) throw conflict('pending cashbox transfer not found');
    await this.approveMovement(pending.id, approverUserId);
  }

  private async ensureOrderTransfer(
    order: Order,
    fromAccountId: string,
    toAccountId: string,
    status: MoneyMovementStatus,
    createdBy: string,
  ): Promise<void> {
    const existing = (await this.repo.listMoneyMovements({ orderId: order.id })).find(
      (movement) =>
        movement.type === MoneyMovementType.Transfer && movement.fromAccountId === fromAccountId && movement.toAccountId === toAccountId,
    );
    if (existing) return;
    await this.createMovement({
      type: MoneyMovementType.Transfer,
      status,
      fromAccountId,
      toAccountId,
      amount: order.total,
      category: 'B2B naqd',
      orderId: order.id,
      createdBy,
      approvedBy: status === MoneyMovementStatus.Approved ? createdBy : undefined,
    });
  }

  private validateMovement(input: CreateMovementInput): void {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw badRequest('money movement amount must be a positive integer');
    if (input.type === MoneyMovementType.Income && (input.fromAccountId || !input.toAccountId)) throw badRequest('income requires toAccountId only');
    if (input.type === MoneyMovementType.Expense && (!input.fromAccountId || input.toAccountId)) throw badRequest('expense requires fromAccountId only');
    if (input.type === MoneyMovementType.Transfer) {
      if (!input.fromAccountId || !input.toAccountId) throw badRequest('transfer requires fromAccountId and toAccountId');
      if (input.fromAccountId === input.toAccountId) throw badRequest('transfer accounts must be distinct');
    }
  }

  private async validateAccountsExist(input: CreateMovementInput): Promise<void> {
    const accounts = await this.repo.listMoneyAccounts();
    const accountIds = new Set(accounts.map((account) => account.id));
    for (const accountId of [input.fromAccountId, input.toAccountId].filter(Boolean) as string[]) {
      if (!accountIds.has(accountId)) throw badRequest(`money account ${accountId} not found`);
    }
  }
}

function todayBounds(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function isWithin(iso: string, start: Date, end: Date): boolean {
  const date = new Date(iso);
  return date >= start && date < end;
}
