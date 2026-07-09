import { useEffect, useState } from 'react';
import { OrderStatus } from '@b2b/shared';
import type { Client, Order } from '@b2b/shared';
import { Icon, connectOrders, type IconName } from '@b2b/web-kit';
import { WS, api, authenticate } from './api.js';
import { OrdersScreen } from './screens/OrdersScreen.js';
import { NewOrderScreen } from './screens/NewOrderScreen.js';
import { ClientsScreen } from './screens/ClientsScreen.js';
import { ClientDetail } from './screens/ClientDetail.js';
import { ReportsScreen } from './screens/ReportsScreen.js';
import { SetsScreen } from './screens/SetsScreen.js';
import './manager.css';

type Tab = 'orders' | 'new' | 'clients' | 'sets' | 'reports';

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

  const titles: Record<Tab, string> = { orders: 'Zakazlar', new: 'Yangi zakaz', clients: 'Mijozlar', sets: "To'plamlar", reports: 'Hisobot' };
  const tabIcon: Record<Tab, IconName> = { orders: 'box', new: 'plus', clients: 'store', sets: 'bag', reports: 'chart' };

  return (
    <div className="app">
      <header className="appbar">
        {client
          ? <button className="back" onClick={() => setClient(null)} aria-label="Orqaga"><Icon name="arrowLeft" size={20} /></button>
          : <div className="mark"><Icon name="box" size={20} /></div>}
        <div>
          <div className="title">{client ? client.name : titles[tab]}</div>
          <div className="sub">{client ? 'Mijoz' : 'B2B menejer'}</div>
        </div>
      </header>

      <div className="body">
        {tab === 'orders' && <OrdersScreen orders={orders} onChange={upsert} />}
        {tab === 'new' && <NewOrderScreen onCreated={(o) => { upsert(o); setTab('orders'); }} />}
        {tab === 'clients' && !client && <ClientsScreen onOpen={setClient} />}
        {tab === 'clients' && client && <ClientDetail client={client} />}
        {tab === 'sets' && <SetsScreen />}
        {tab === 'reports' && <ReportsScreen orders={orders} />}
      </div>

      <nav className="tabs">
        {(['orders', 'new', 'clients', 'sets', 'reports'] as Tab[]).map((t) => (
          <button
            key={t}
            className="tab"
            data-active={tab === t}
            onClick={() => { setTab(t); if (t !== 'clients') setClient(null); }}
          >
            {t === 'orders' && readyCount > 0 && <span className="badge">{readyCount}</span>}
            <Icon name={tabIcon[t]} size={22} />
            {titles[t]}
          </button>
        ))}
      </nav>
    </div>
  );
}
