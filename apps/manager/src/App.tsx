import { useEffect, useState } from 'react';
import { OrderStatus } from '@b2b/shared';
import type { Client, Order } from '@b2b/shared';
import { connectOrders } from '@b2b/web-kit';
import { WS, api, authenticate } from './api.js';
import { OrdersScreen } from './screens/OrdersScreen.js';
import { NewOrderScreen } from './screens/NewOrderScreen.js';
import { ClientsScreen } from './screens/ClientsScreen.js';
import { ClientDetail } from './screens/ClientDetail.js';
import { ReportsScreen } from './screens/ReportsScreen.js';
import './manager.css';

type Tab = 'orders' | 'new' | 'clients' | 'reports';

export function App() {
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [client, setClient] = useState<Client | null>(null); // clients drilldown

  useEffect(() => { authenticate().then(setUserId).catch(() => setUserId('u1')); }, []);

  useEffect(() => {
    if (!userId) return;
    api.orders().then((l) => setOrders(Object.fromEntries(l.map((o) => [o.id, o])))).catch(() => {});
    return connectOrders(WS, { subscribe: 'manager', userId }, (e) =>
      setOrders((p) => ({ ...p, [e.order.id]: e.order })),
    );
  }, [userId]);

  const upsert = (o: Order) => setOrders((p) => ({ ...p, [o.id]: o }));
  const readyCount = Object.values(orders).filter((o) => o.status === OrderStatus.Ready).length;

  const titles: Record<Tab, string> = { orders: 'Zakazlar', new: 'Yangi zakaz', clients: 'Mijozlar', reports: 'Hisobot' };

  return (
    <div className="app">
      <div className="head">
        <h1>{client ? client.name : titles[tab]}</h1>
        <div className="spacer" />
        {client && <button className="btn btn--ghost" onClick={() => setClient(null)}>← Orqaga</button>}
      </div>

      <div className="body">
        {tab === 'orders' && <OrdersScreen orders={orders} onChange={upsert} />}
        {tab === 'new' && <NewOrderScreen onCreated={(o) => { upsert(o); setTab('orders'); }} />}
        {tab === 'clients' && !client && <ClientsScreen onOpen={setClient} />}
        {tab === 'clients' && client && <ClientDetail client={client} />}
        {tab === 'reports' && <ReportsScreen orders={orders} />}
      </div>

      <nav className="tabs">
        {(['orders', 'new', 'clients', 'reports'] as Tab[]).map((t) => (
          <button
            key={t}
            className="tab"
            data-active={tab === t}
            onClick={() => { setTab(t); if (t !== 'clients') setClient(null); }}
          >
            <span className="ic">{{ orders: '🧾', new: '＋', clients: '🏢', reports: '📊' }[t]}</span>
            {t === 'orders' && readyCount > 0 && <span className="badge">{readyCount}</span>}
            {titles[t]}
          </button>
        ))}
      </nav>
    </div>
  );
}
