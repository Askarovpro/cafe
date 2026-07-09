import { useEffect, useMemo, useState } from 'react';
import { CashCustody, OrderAction, OrderStatus, PaymentType } from '@b2b/shared';
import type { Client, Order } from '@b2b/shared';
import { ApiClient, Icon, connectOrders, initTelegram, som } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws') + '/ws';
const api = new ApiClient(API);
const DEV_USER = import.meta.env.VITE_DEV_USER ?? 'f1';
const DRIVERS: Record<string, string> = { d1: 'Botir' };
const driverName = (id?: string) => (id ? DRIVERS[id] ?? id : '—');

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
type Tab = 'confirm' | 'reports';

export function App() {
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [tab, setTab] = useState<Tab>('confirm');

  useEffect(() => {
    const { initData, inTelegram } = initTelegram();
    api.authTelegram(inTelegram ? initData : `dev:${DEV_USER}`)
      .then((r) => { api.setToken(r.token); setReady(true); })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    api.orders().then((l) => setOrders(Object.fromEntries(l.map((o) => [o.id, o])))).catch(() => {});
    api.clients().then(setClients).catch(() => {});
    return connectOrders(WS, { subscribe: 'kds' }, (e) => setOrders((p) => ({ ...p, [e.order.id]: e.order })));
  }, [ready]);

  const g = useMemo(() => {
    const cash = Object.values(orders).filter((o) => o.paymentType === PaymentType.Cash);
    const delivered = cash.filter((o) => o.status === OrderStatus.Delivered);
    const withDriver = delivered.filter((o) => !o.cashCustody);
    const withManager = delivered.filter((o) => o.cashCustody === CashCustody.Manager);
    const pending = delivered.filter((o) => o.cashCustody === CashCustody.Finance);
    const closed = cash.filter((o) => o.status === OrderStatus.Closed);
    const sum = (a: Order[]) => a.reduce((s, o) => s + o.total, 0);
    return {
      withDriver, withManager, pending, closed,
      withDriverT: sum(withDriver), withManagerT: sum(withManager), pendingT: sum(pending),
      confirmedTodayT: sum(closed.filter((o) => isToday(o.updatedAt))),
      confirmedTodayN: closed.filter((o) => isToday(o.updatedAt)).length,
    };
  }, [orders]);

  const debtors = clients.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
  const totalDebt = debtors.reduce((s, c) => s + c.balance, 0);

  const upsert = (u: Order) => setOrders((p) => ({ ...p, [u.id]: u }));
  const confirm = (o: Order) => api.transition(o.id, { action: OrderAction.CashConfirm }).then(upsert).catch(() => {});
  const confirmAll = () => Promise.all(g.pending.map((o) => api.transition(o.id, { action: OrderAction.CashConfirm }).then(upsert))).catch(() => {});

  // cash owed back per driver (collected, not yet in the till)
  const perDriver = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of [...g.withDriver, ...g.withManager, ...g.pending]) m[o.driverId ?? '—'] = (m[o.driverId ?? '—'] ?? 0) + o.total;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [g]);

  return (
    <div className="wrap">
      <header className="appbar">
        <div className="mark"><Icon name="wallet" size={20} /></div>
        <div><div className="title">Moliyachi</div><div className="sub">Kassa · naqd</div></div>
        <span className="count">{g.pending.length} kutilmoqda</span>
      </header>

      {tab === 'confirm' && (
        <>
          <div className="cashhero">
            <div className="cap">Tasdiq kutilmoqda (menejerlardan)</div>
            <div className="amt">{som(g.pendingT)} <small>so'm</small></div>
            {g.pending.length > 0 && (
              <button className="btn btn--block" onClick={confirmAll}><Icon name="checkCircle" size={20} /> Hammasini oldim</button>
            )}
          </div>
          {g.pending.length === 0 && (
            <div className="empty"><div className="big"><Icon name="checkCircle" size={30} /></div>Qabul qilinadigan naqd yo'q.</div>
          )}
          <div className="list">
            {g.pending.map((o) => (
              <div className="ocard" key={o.id}>
                <div className="ocard__top">
                  <span className="ocard__id">#{o.id.length > 8 ? o.id.slice(-4).toUpperCase() : o.id}</span>
                  <span style={{ flex: 1 }} />
                  <span className="muted ico-text"><Icon name="truck" size={15} /> {driverName(o.driverId)}</span>
                </div>
                <div className="ocard__client">{o.clientName}</div>
                <div className="drows">
                  <div className="drow"><span className="ico"><Icon name="money" size={20} /></span>
                    <div><div className="lbl">Naqd</div><div className="val">{som(o.total)} so'm</div></div>
                  </div>
                </div>
                <div className="ocard__foot">
                  <button className="btn btn--block" onClick={() => confirm(o)}><Icon name="checkCircle" size={18} /> Pulni oldim</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'reports' && (
        <>
          <div className="pipe">
            <Pcard icon="truck" label="Driverlarda" v={g.withDriverT} n={g.withDriver.length} />
            <Pcard icon="user" label="Menejerlarda" v={g.withManagerT} n={g.withManager.length} />
            <Pcard icon="clock" label="Kutilmoqda" v={g.pendingT} n={g.pending.length} />
            <Pcard icon="checkCircle" label="Bugun kassada" v={g.confirmedTodayT} n={g.confirmedTodayN} />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Driver bo'yicha (kassaga tushmagan)</h3>
            {perDriver.length === 0 && <div className="muted">Yo'q</div>}
            {perDriver.map(([id, amt]) => (
              <div className="rowitem" key={id}>
                <span className="ico-text"><Icon name="truck" size={16} /> {driverName(id)}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{som(amt)}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Qarzdor kompaniyalar · jami {som(totalDebt)} so'm</h3>
            {debtors.length === 0 && <div className="muted ico-text"><Icon name="checkCircle" size={15} /> Qarzdor yo'q</div>}
            {debtors.map((c) => (
              <div className="rowitem" key={c.id}>
                <span className="ico-text"><Icon name="store" size={16} /> {c.name}</span>
                <span className="mono bal--debt">{som(c.balance)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <nav className="nav">
        <button data-active={tab === 'confirm'} onClick={() => setTab('confirm')}><Icon name="money" size={20} /> Naqd</button>
        <button data-active={tab === 'reports'} onClick={() => setTab('reports')}><Icon name="chart" size={20} /> Hisobot</button>
      </nav>
    </div>
  );
}

function Pcard({ icon, label, v, n }: { icon: 'truck' | 'user' | 'clock' | 'checkCircle'; label: string; v: number; n: number }) {
  return (
    <div className="pcard">
      <div className="l"><Icon name={icon} size={15} /> {label}</div>
      <div className="v">{som(v)} <small>· {n}</small></div>
    </div>
  );
}
