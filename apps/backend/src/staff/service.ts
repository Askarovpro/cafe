import {
  MoneyMovementStatus,
  PayoutKind,
  type CreateStaff,
  type MoneyMovement,
  type PayStaff,
  type Staff,
  type UpdateStaff,
} from '@b2b/shared';
import { badRequest, notFound } from '../errors.js';
import { id, isoNow } from '../ids.js';
import { MoneyService } from '../money/service.js';
import type { AppRepository, StoredStaff } from '../repositories/types.js';

const PAYROLL_CATEGORIES = new Set(['Avans', 'Oylik']);

export class StaffService {
  constructor(
    private readonly repo: AppRepository,
    private readonly money: MoneyService,
  ) {}

  async list(): Promise<Staff[]> {
    const staff = await this.repo.listStaff();
    return this.withMonthlyPayroll(staff);
  }

  async create(input: CreateStaff): Promise<Staff> {
    this.validateSalary(input.salary);
    const staff = await this.repo.createStaff({
      id: id('staff'),
      name: input.name,
      position: input.position,
      salary: input.salary,
      active: true,
      createdAt: isoNow(),
    });
    return this.withMonthlyPayroll(staff);
  }

  async update(staffId: string, input: UpdateStaff): Promise<Staff> {
    const existing = await this.repo.findStaffById(staffId);
    if (!existing) throw notFound('staff not found');
    if (input.salary !== undefined) this.validateSalary(input.salary);
    const updated = await this.repo.updateStaff(staffId, input);
    return this.withMonthlyPayroll(updated);
  }

  async pay(staffId: string, input: PayStaff, createdBy: string): Promise<MoneyMovement> {
    const staff = await this.repo.findStaffById(staffId);
    if (!staff) throw notFound('staff not found');
    const category = input.kind === PayoutKind.Advance ? 'Avans' : 'Oylik';
    return this.money.recordExpense(
      {
        amount: input.amount,
        category,
        note: input.note,
        counterparty: staff.name,
        staffId,
      },
      createdBy,
    );
  }

  private async withMonthlyPayroll<T extends StoredStaff | StoredStaff[]>(input: T): Promise<T extends StoredStaff[] ? Staff[] : Staff> {
    const staff = Array.isArray(input) ? input : [input];
    const totals = await this.currentMonthTotalsByStaffId();
    const hydrated = staff.map((person) => {
      const total = totals.get(person.id) ?? { advancesThisMonth: 0, paidThisMonth: 0 };
      return {
        id: person.id,
        name: person.name,
        position: person.position,
        salary: person.salary,
        active: person.active,
        advancesThisMonth: total.advancesThisMonth,
        paidThisMonth: total.paidThisMonth,
        balance: person.salary - total.paidThisMonth,
      };
    });
    return (Array.isArray(input) ? hydrated : hydrated[0]) as T extends StoredStaff[] ? Staff[] : Staff;
  }

  private async currentMonthTotalsByStaffId(): Promise<Map<string, { advancesThisMonth: number; paidThisMonth: number }>> {
    const { start, end } = currentMonthToNowBounds();
    const totals = new Map<string, { advancesThisMonth: number; paidThisMonth: number }>();
    for (const movement of await this.repo.listMoneyMovements()) {
      if (
        !movement.staffId ||
        movement.status !== MoneyMovementStatus.Approved ||
        !movement.category ||
        !PAYROLL_CATEGORIES.has(movement.category) ||
        !isWithin(movement.occurredAt, start, end)
      ) {
        continue;
      }

      const total = totals.get(movement.staffId) ?? { advancesThisMonth: 0, paidThisMonth: 0 };
      total.paidThisMonth += movement.amount;
      if (movement.category === 'Avans') total.advancesThisMonth += movement.amount;
      totals.set(movement.staffId, total);
    }
    return totals;
  }

  private validateSalary(salary: number): void {
    if (!Number.isInteger(salary) || salary < 0) throw badRequest('staff salary must be a nonnegative integer');
  }
}

function currentMonthToNowBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

function isWithin(iso: string, start: Date, end: Date): boolean {
  const date = new Date(iso);
  return date >= start && date <= end;
}
