import { useEffect, useMemo, useState } from 'react';
import { OrderAction, OrderStatus, PaymentType, Role } from '@b2b/shared';
import type { Order } from '@b2b/shared';
import { ApiClient, Icon, StatusChip, connectOrders, initTelegram, som } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws') + '/ws';
const api = new ApiClient(API);
const DEV_DRIVER = import.meta.env.VITE_DRIVER_ID ?? 'd1';

const ACTIVE = new Set<OrderStatus>([OrderStatus.Assigned, OrderStatus.Delivering]);

export function App() {
  const [driverId, setDriverId] = useState('');
  const [name, setName] = useState('Driver');
  const [orders, setOrders] = useState<Record<string, Order>>({});

  useEffect(() => {
    const { initData, inTelegram } = initTelegram();
    api.authTelegram(inTelegram ? initData : `dev:${DEV_DRIVER}`)
      .then((r) => {
        api.setToken(r.token);
        setDriverId(r.user.role === Role.Driver ? r.user.id : DEV_DRIVER);
        setName(r.user.role === Role.Driver ? r.user.name : 'Botir');
      })
      .catch(() => setDriverId(DEV_DRIVER));
  }, []);

  useEffect(() => {
    if (!driverId) return;
    api.orders().then((list) => {
      setOrders(Object.fromEntries(list.filter((o) => o.driverId === driverId).map((o) => [o.id, o])));
    }).catch(() => {});
    return connectOrders(WS, { subscribe: 'driver', driverId }, (e) => {
      if (e.order.driverId === driverId) setOrders((p) => ({ ...p, [e.order.id]: e.order }));
    });
  }, [driverId]);

  const active = useMemo(
    () => Object.values(orders).filter((o) => ACTIVE.has(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [orders],
  );

  const act = (o: Order, action: OrderAction) =>
    api.transition(o.id, { action, ...(action === OrderAction.Deliver ? { cashCollected: o.paymentType === PaymentType.Cash } : {}) })
      .then((u) => setOrders((p) => ({ ...p, [u.id]: u }))).catch(() => {});

  return (
    <div className="wrap">
      <header className="appbar">
        <div className="mark"><Icon name="truck" size={20} /></div>
        <div>
          <div className="title">{name}</div>
          <div className="sub">Yetkazuvchi</div>
        </div>
        <span className="count">{active.length} faol</span>
      </header>

      {active.length === 0 ? (
        <div className="empty">
          <div className="big"><Icon name="truck" size={30} /></div>
          Hozircha yetkazma yo'q.
        </div>
      ) : (
        <>
          <div className="sectiontitle">Yetkazmalar</div>
          <div className="list">
            {active.map((o) => (
              <OrderCard key={o.id} order={o} onAct={act} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrderCard({ order: o, onAct }: { order: Order; onAct: (o: Order, a: OrderAction) => void }) {
  const itemsSummary = o.items.map((i) => `${i.qty}× ${i.name}`).join(', ');
  return (
    <div className="ocard">
      <div className="ocard__top">
        <span className="ocard__id">#{o.id.length > 8 ? o.id.slice(-4).toUpperCase() : o.id}</span>
        <span style={{ flex: 1 }} />
        <StatusChip status={o.status} />
      </div>
      <div className="ocard__client">{o.clientName}</div>
      <div className="ocard__items">{itemsSummary} · {o.portions}p</div>

      <div className="drows">
        <div className="drow">
          <span className="ico"><Icon name="destination" size={20} /></span>
          <div>
            <div className="lbl">Manzil</div>
            <div className="val">{o.location.label} — {o.location.address}</div>
          </div>
        </div>
        <a className="drow tappable" href={`tel:${o.contactPhone}`}>
          <span className="ico"><Icon name="phone" size={20} /></span>
          <div>
            <div className="lbl">Kontakt</div>
            <div className="val">{o.contactPhone}</div>
          </div>
          <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}><Icon name="chevronRight" size={20} /></span>
        </a>
        {o.paymentType === PaymentType.Cash && (
          <div className="drow drow--cash">
            <span className="ico"><Icon name="money" size={20} /></span>
            <div>
              <div className="lbl">Naqd olish</div>
              <div className="val">{som(o.total)} so'm</div>
            </div>
          </div>
        )}
      </div>

      <div className="ocard__foot">
        {o.status === OrderStatus.Assigned && (
          <button className="btn btn--dark btn--block" onClick={() => onAct(o, OrderAction.Pickup)}>
            <Icon name="box" size={20} /> Oldim
          </button>
        )}
        {o.status === OrderStatus.Delivering && (
          <button className="btn btn--block" onClick={() => onAct(o, OrderAction.Deliver)}>
            <Icon name="checkCircle" size={20} />
            Yetkazdim{o.paymentType === PaymentType.Cash ? ` · ${som(o.total)} so'm oldim` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
