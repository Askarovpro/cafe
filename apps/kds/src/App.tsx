import { useEffect, useMemo, useState } from 'react';
import { OrderAction, OrderStatus } from '@b2b/shared';
import type { Order } from '@b2b/shared';
import { ApiClient, Docket, Money, connectOrders, initTelegram } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws') + '/ws';
const api = new ApiClient(API);
const DEV_USER = import.meta.env.VITE_DEV_USER ?? 'u2'; // kitchen, for local dev-auth outside Telegram

async function authenticate(): Promise<void> {
  const { initData, inTelegram } = initTelegram();
  const r = await api.authTelegram(inTelegram ? initData : `dev:${DEV_USER}`);
  api.setToken(r.token);
}

const COLUMNS: { status: OrderStatus; title: string; accent: string; advance?: OrderAction; label?: string }[] = [
  { status: OrderStatus.New, title: 'Tushgan', accent: 'var(--st-new)', advance: OrderAction.StartPrep, label: 'Boshlash' },
  { status: OrderStatus.Preparing, title: 'Tayyorlanmoqda', accent: 'var(--st-preparing)', advance: OrderAction.Ready, label: 'Tayyor ✓' },
  { status: OrderStatus.Ready, title: 'Tayyor', accent: 'var(--st-ready)' },
];

function age(iso: string): { text: string; cls: string } {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  const cls = min >= 20 ? 'age--late' : min >= 10 ? 'age--warn' : '';
  return { text: `${min} daq`, cls };
}

export function App() {
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stop = () => {};
    authenticate()
      .catch(() => {}) // mock ignores auth; real backend needs it
      .then(() => api.orders())
      .then((list) => setOrders(Object.fromEntries(list.map((o) => [o.id, o]))))
      .catch(() => {});
    stop = connectOrders(WS, { subscribe: 'kds' }, (e) => {
      setOrders((prev) => ({ ...prev, [e.order.id]: e.order }));
    });
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { stop(); clearInterval(t); };
  }, []);

  const byStatus = useMemo(() => {
    const map: Record<string, Order[]> = {};
    for (const o of Object.values(orders)) (map[o.status] ??= []).push(o);
    for (const k in map) map[k].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return map;
  }, [orders]);

  const advance = (o: Order, action: OrderAction) => {
    api.transition(o.id, { action }).then((u) => setOrders((p) => ({ ...p, [u.id]: u }))).catch(() => {});
  };

  const clock = new Date(now).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="kds">
      <div className="kds__bar">
        <h1>Kamolliddin — Oshxona</h1>
        <span className="sub">B2B liniya</span>
        <span className="kds__clock">{clock}</span>
      </div>
      <div className="kds__cols">
        {COLUMNS.map((col) => {
          const list = byStatus[col.status] ?? [];
          return (
            <div className="col" key={col.status} style={{ ['--accent' as string]: col.accent }}>
              <div className="col__head">
                {col.title}
                <span className="count">{list.length}</span>
              </div>
              <div className="col__body">
                {list.length === 0 && <div className="empty">— bo'sh —</div>}
                {list.map((o) => {
                  const a = age(o.createdAt);
                  return (
                    <Docket
                      key={o.id}
                      order={o}
                      showStatus={false}
                      actions={
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span className={`age ${a.cls}`}>⏱ {a.text}</span>
                            <span className="mono" style={{ color: 'var(--muted)' }}>
                              <Money value={o.total} /> so'm
                            </span>
                          </div>
                          {col.advance && (
                            <button className="btn btn--block" onClick={() => advance(o, col.advance!)}>
                              {col.label}
                            </button>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
