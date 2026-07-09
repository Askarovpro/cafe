import {
  CashCustody,
  DeliveryType,
  ORDER_TRANSITIONS,
  OrderAction,
  OrderStatus,
  PaymentType,
  Role,
  type Order,
  type OrderItem,
  type ServerEvent,
  type Transition,
  type User,
} from '@b2b/shared';
import type { CreateOrder } from '@b2b/shared';
import { yandexDeeplink, type Notifier } from '../delivery/notifier.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { id, isoNow } from '../ids.js';
import type { LedgerService } from '../ledger/service.js';
import type { MoneyService } from '../money/service.js';
import type { PosterClient, PosterOrder } from '../poster-sync/poster-client.js';
import type { AppRepository } from '../repositories/types.js';
import type { RealtimeHub } from '../realtime/hub.js';

export class OrdersService {
  constructor(
    private readonly repo: AppRepository,
    private readonly ledger: LedgerService,
    private readonly money: MoneyService,
    private readonly poster: PosterClient,
    private readonly notifier: Notifier,
    private readonly hub: RealtimeHub,
  ) {}

  async create(input: CreateOrder, user: User): Promise<Order> {
    if (user.role !== Role.Manager && user.role !== Role.Owner) throw forbidden('only managers can create orders');
    const client = await this.repo.findClientById(input.clientId);
    if (!client) throw notFound('client not found');

    const items: OrderItem[] = [];
    for (const item of input.items) {
      const product = await this.repo.findProductById(item.productId);
      if (!product) throw notFound('product not found');
      const price = await this.repo.findClientPrice(input.clientId, item.productId);
      if (!price) throw badRequest(`product ${item.productId} is not offered to this client`);
      items.push({
        productId: product.id,
        name: product.name,
        qty: item.qty,
        unitPrice: price.price,
        lineTotal: price.price * item.qty,
      });
    }

    const now = isoNow();
    const order: Order = {
      id: id('order'),
      clientId: client.id,
      clientName: client.name,
      createdBy: user.id,
      status: OrderStatus.New,
      items,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0),
      paymentType: input.paymentType,
      location: input.location,
      contactPhone: input.contactPhone,
      portions: input.portions,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.repo.createOrder(order);
    this.emit({ type: 'order.created', order: created });
    return created;
  }

  async get(orderId: string): Promise<Order> {
    const order = await this.repo.findOrderById(orderId);
    if (!order) throw notFound('order not found');
    return order;
  }

  async list(query: { status?: string; mine?: boolean }, user: User): Promise<Order[]> {
    if (user.role === Role.Driver) return this.repo.listOrders({ status: query.status, driverId: user.id });
    if (user.role === Role.Kitchen) return this.repo.listOrders({ status: query.status, activeOnly: true });
    if (user.role === Role.Finance) return this.repo.listOrders({ status: query.status });
    return this.repo.listOrders({ status: query.status, createdBy: query.mine ? user.id : undefined });
  }

  async transition(orderId: string, input: Transition, user: User): Promise<Order> {
    const order = await this.get(orderId);
    const rule = ORDER_TRANSITIONS[input.action];
    if (!this.canRoleTransition(input.action, user.role)) throw forbidden(`role ${user.role} cannot ${input.action}`);
    if (!rule.from.includes(order.status)) throw conflict(`cannot ${input.action} from ${order.status}`);

    const updated: Order = { ...order, status: rule.to, updatedAt: isoNow() };

    if (input.action === OrderAction.Assign) await this.applyAssign(updated, input);
    if (input.action === OrderAction.Deliver) {
      updated.cashCollected = input.cashCollected ?? updated.paymentType === PaymentType.Cash;
      await this.money.recordOrderCashDelivery(updated, user.id);
    }
    if (input.action === OrderAction.CashToManager) {
      updated.cashCustody = CashCustody.Manager;
      await this.money.recordOrderCashToManager(updated, user.id);
    }
    if (input.action === OrderAction.CashToFinance) {
      updated.cashCustody = CashCustody.Finance;
      await this.money.recordOrderCashToFinance(updated, user.id);
    }
    if (input.action === OrderAction.CashConfirm) {
      await this.money.approveOrderCashboxTransfer(updated, user.id);
      await this.ensureClosePayment(updated, user);
    }
    if (input.action === OrderAction.Ready) await this.ensureReadySideEffects(updated, user);
    if (input.action === OrderAction.Close) await this.ensureClosePayment(updated, user);
    if (input.action === OrderAction.Cancel) await this.ensureCancelReversal(order, updated, user);

    const saved = await this.repo.updateOrder(updated);
    this.emit({ type: 'order.updated', order: saved });
    return saved;
  }

  private canRoleTransition(action: OrderAction, role: Role): boolean {
    if (action === OrderAction.Cancel) return role === Role.Manager || role === Role.Owner;
    return ORDER_TRANSITIONS[action].role === role;
  }

  private async applyAssign(order: Order, input: Transition): Promise<void> {
    if (!input.deliveryType) throw badRequest('deliveryType is required');
    order.deliveryType = input.deliveryType;
    if (input.deliveryType === DeliveryType.OwnDriver) {
      if (!input.driverId) throw badRequest('driverId is required for own_driver');
      order.driverId = input.driverId;
      await this.notifier.notifyUser(input.driverId, `New delivery assigned: ${order.clientName}`);
    }
    if (input.deliveryType === DeliveryType.Yandex) {
      order.yandexDeeplink = yandexDeeplink(order.location.lat, order.location.lng);
    }
  }

  private async ensureReadySideEffects(order: Order, user: User): Promise<void> {
    if (!order.posterOrderId) order.posterOrderId = await this.poster.createIncomingOrder(await this.toPosterOrder(order));
    const existingCharge = await this.repo.findLedgerEntry({ orderId: order.id, type: 'charge' });
    if (!existingCharge) {
      await this.ledger.appendCharge({
        clientId: order.clientId,
        orderId: order.id,
        amount: order.total,
        createdBy: user.id,
        note: 'order ready',
      });
    }
  }

  private async toPosterOrder(order: Order): Promise<PosterOrder> {
    const items = await Promise.all(
      order.items.map(async (item) => {
        const product = await this.repo.findProductById(item.productId);
        if (!product) throw notFound('product not found');
        return { ...item, posterProductId: product.posterId };
      }),
    );
    return { ...order, items };
  }

  private async ensureClosePayment(order: Order, user: User): Promise<void> {
    if (order.paymentType === PaymentType.Transfer) return;
    const existingPayment = await this.repo.findLedgerEntry({ orderId: order.id, type: 'payment', method: order.paymentType });
    if (!existingPayment) {
      await this.ledger.appendOrderPayment({
        clientId: order.clientId,
        orderId: order.id,
        amount: order.total,
        method: order.paymentType,
        createdBy: user.id,
        note: 'order closed',
      });
    }
  }

  private async ensureCancelReversal(previous: Order, updated: Order, user: User): Promise<void> {
    const charge = await this.repo.findLedgerEntry({ orderId: previous.id, type: 'charge' });
    if (!previous.posterOrderId && !charge) return;
    if (previous.posterOrderId) await this.poster.voidIncomingOrder(previous.posterOrderId);
    const reversal = await this.repo.findLedgerEntry({ orderId: previous.id, type: 'payment', method: 'reversal' });
    if (!reversal && charge) {
      await this.ledger.appendOrderPayment({
        clientId: previous.clientId,
        orderId: previous.id,
        amount: charge.amount,
        method: 'reversal',
        createdBy: user.id,
        note: 'cancel after Ready',
      });
    }
    updated.posterOrderId = previous.posterOrderId;
  }

  private emit(event: ServerEvent): void {
    this.hub.broadcast(event);
  }
}
