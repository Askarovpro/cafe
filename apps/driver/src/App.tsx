import { useEffect, useMemo, useState } from 'react';
import { OrderAction, OrderStatus, PaymentType, Role } from '@b2b/shared';
import type { Order } from '@b2b/shared';
import { ApiClient, Docket, Money, connectOrders, initTelegram, som } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws') + '/ws';
const api = new ApiClient(API);
const DEV_DRIVER = import.meta.env.VITE_DRIVER_ID ?? 'd1'; // dev fallback outside Telegram

const ACTIVE = new Set<OrderStatus>([OrderStatus.Assigned, OrderStatus.Delivering]);

export function App() {
  const [driverId, setDriverId] = useState<string>('');
  const [name, setName] = useState('Driver');
  const [orders, setOrders] = useState<Record<string, Order>>({});

  useEffect(() => {
    const { initData } = initTelegram();
    api.authTelegram(initData)
      .then((r) => {
        api.setToken(r.token);
        const dId = r.user.role === Role.Driver ? r.user.id : DEV_DRIVER;
        setDriverId(dId);
        setName(r.user.role === Role.Driver ? r.user.name : 'Driver (dev)');
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
      <div className="top">
        <h1>Yetkazmalar</h1>
        <span className="who">{name}</span>
      </div>

      {active.length === 0 && (
        <div className="empty">
          <div className="big">🛵</div>
          Hozircha yetkazma yo'q.
        </div>
      )}

      <div className="list">
        {active.map((o) => (
          <Docket
            key={o.id}
            order={o}
            actions={
              <>
                <div className="meta">
                  <div className="line"><span className="ico">📍</span>{o.location.label} — {o.location.address}</div>
                  <a className="line" href={`tel:${o.contactPhone}`}><span className="ico">📞</span>{o.contactPhone}</a>
                  {o.paymentType === PaymentType.Cash && (
                    <div className="line cash"><span className="ico">💵</span>Naqd olish: <Money value={o.total} /> so'm</div>
                  )}
                </div>
                {o.status === OrderStatus.Assigned && (
                  <button className="btn btn--block" onClick={() => act(o, OrderAction.Pickup)}>Oldim ✓</button>
                )}
                {o.status === OrderStatus.Delivering && (
                  <button className="btn btn--block" onClick={() => act(o, OrderAction.Deliver)}>
                    Yetkazdim {o.paymentType === PaymentType.Cash ? `· ${som(o.total)} so'm oldim` : ''} ✓
                  </button>
                )}
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
