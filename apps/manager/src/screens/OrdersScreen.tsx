import { useState } from 'react';
import { CashCustody, DeliveryType, OrderAction, OrderStatus, PaymentType } from '@b2b/shared';
import type { Order } from '@b2b/shared';
import { Docket, Icon, Money } from '@b2b/web-kit';
import { DRIVERS, api } from '../api.js';

const ACTIVE = new Set<OrderStatus>([
  OrderStatus.New, OrderStatus.Preparing, OrderStatus.Ready,
  OrderStatus.Assigned, OrderStatus.Delivering, OrderStatus.Delivered,
]);

export function OrdersScreen({ orders, onChange }: { orders: Record<string, Order>; onChange: (o: Order) => void }) {
  const list = Object.values(orders)
    .filter((o) => ACTIVE.has(o.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (list.length === 0) return <div className="empty">Faol zakaz yo'q. «Yangi» orqali qo'shing.</div>;

  return (
    <>
      {list.map((o) => {
        const needsAction = o.status === OrderStatus.Ready || (o.status === OrderStatus.Delivered && o.cashCustody === CashCustody.Manager);
        return (
          <div key={o.id} className={needsAction ? 'alert' : ''} style={{ borderRadius: 'var(--r)' }}>
            <Docket order={o} actions={<OrderActions order={o} onChange={onChange} />} />
          </div>
        );
      })}
    </>
  );
}

function OrderActions({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const [driver, setDriver] = useState(DRIVERS[0]?.id ?? '');
  const run = (body: Parameters<typeof api.transition>[1]) =>
    api.transition(order.id, body).then(onChange).catch((e) => alert(e.message ?? 'Xatolik'));

  if (order.status === OrderStatus.Ready) {
    return (
      <>
        <div className="muted">Tayyor — yetkazishni tanlang:</div>
        <div className="split">
          <select value={driver} onChange={(e) => setDriver(e.target.value)}>
            {DRIVERS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn" onClick={() => run({ action: OrderAction.Assign, deliveryType: DeliveryType.OwnDriver, driverId: driver })}>
            Biriktirish
          </button>
        </div>
        <button className="btn btn--ghost btn--block" onClick={() => run({ action: OrderAction.Assign, deliveryType: DeliveryType.Yandex })}>
          Yandex bilan
        </button>
      </>
    );
  }
  if (order.status === OrderStatus.Assigned || order.status === OrderStatus.Delivering) {
    const who = order.deliveryType === DeliveryType.Yandex ? 'Yandex' : DRIVERS.find((d) => d.id === order.driverId)?.name ?? 'Driver';
    return (
      <div className="split">
        <span className="muted ico-text"><Icon name="truck" size={16} /> {who} · {order.status === OrderStatus.Delivering ? "yo'lda" : 'biriktirildi'}</span>
        {order.yandexDeeplink && <a className="btn btn--ghost" href={order.yandexDeeplink} target="_blank" rel="noreferrer">Yandex ochish</a>}
      </div>
    );
  }
  if (order.status === OrderStatus.Delivered) {
    if (order.paymentType !== PaymentType.Cash) {
      return <button className="btn btn--block" onClick={() => run({ action: OrderAction.Close })}>Yopish (to'landi)</button>;
    }
    if (!order.cashCustody) {
      return <div className="muted ico-text"><Icon name="clock" size={15} /> Driver hali topshirmagan</div>;
    }
    if (order.cashCustody === CashCustody.Manager) {
      return (
        <>
          <div className="muted ico-text" style={{ color: 'var(--st-ready)' }}>
            <Icon name="checkCircle" size={15} /> Driver topshirdi — naqd sizda
          </div>
          <button className="btn btn--block" onClick={() => run({ action: OrderAction.CashToFinance })}>
            <Icon name="wallet" size={18} /> Moliyachiga berdim · <Money value={order.total} /> so'm
          </button>
        </>
      );
    }
    return <div className="muted ico-text"><Icon name="clock" size={15} /> Moliyachida — tasdiq kutilmoqda</div>;
  }
  return <div className="muted">Oshxonada…</div>;
}
