import { useEffect, useMemo, useState } from 'react';
import { OrderStatus, PaymentType } from '@b2b/shared';
import type { Client, MoneySummary, Order, Staff } from '@b2b/shared';
import { ApiClient, Icon, connectOrders, initTelegram, som } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws') + '/ws';
const api = new ApiClient(API);
const DEV_USER = import.meta.env.VITE_DEV_USER ?? 'o1';

const CHARGED = new Set<OrderStatus>([
  OrderStatus.Ready, OrderStatus.Assigned, OrderStatus.Delivering, OrderStatus.Delivered, OrderStatus.Closed,
]);
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const uzDate = () => { const d = new Date(); return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`; };

export function App() {
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [summary, setSummary] = useState<MoneySummary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  useEffect(() => {
    const { initData, inTelegram } = initTelegram();
    api.authTelegram(inTelegram ? initData : `dev:${DEV_USER}`)
      .then((r) => { api.setToken(r.token); setReady(true); }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    api.orders().then((l) => setOrders(Object.fromEntries(l.map((o) => [o.id, o])))).catch(() => {});
    api.moneySummary().then(setSummary).catch(() => {});
    api.clients().then(setClients).catch(() => {});
    api.staff().then(setStaff).catch(() => {});
    return connectOrders(WS, { subscribe: 'kds' }, (e) => setOrders((p) => ({ ...p, [e.order.id]: e.order })));
  }, [ready]);

  const m = useMemo(() => {
    const all = Object.values(orders);
    const todays = all.filter((o) => isToday(o.createdAt));
    const chargedToday = todays.filter((o) => CHARGED.has(o.status));
    const revenueToday = chargedToday.reduce((s, o) => s + o.total, 0);
    const active = all.filter((o) => o.status !== OrderStatus.Closed && o.status !== OrderStatus.Cancelled).length;
    const deliveredToday = todays.filter((o) => o.status === OrderStatus.Delivered || o.status === OrderStatus.Closed).length;

    const prod: Record<string, { name: string; qty: number; rev: number }> = {};
    for (const o of all) if (CHARGED.has(o.status)) for (const it of o.items) {
      const p = (prod[it.productId] ??= { name: it.name, qty: 0, rev: 0 });
      p.qty += it.qty; p.rev += it.lineTotal;
    }
    const top = Object.values(prod).sort((a, b) => b.qty - a.qty).slice(0, 6);
    const maxQty = top[0]?.qty ?? 1;
    return { revenueToday, ordersToday: chargedToday.length, avg: chargedToday.length ? Math.round(revenueToday / chargedToday.length) : 0, active, deliveredToday, top, maxQty };
  }, [orders]);

  const debtors = clients.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
  const totalDebt = debtors.reduce((s, c) => s + c.balance, 0);
  const wageBill = staff.reduce((s, x) => s + x.salary, 0);
  const paidThisMonth = staff.reduce((s, x) => s + x.paidThisMonth, 0);

  return (
    <div className="wrap">
      <header className="appbar">
        <div className="mark"><Icon name="chart" size={20} /></div>
        <div><div className="title">Egasi</div><div className="sub">Umumiy nazorat</div></div>
        <span className="today">{uzDate()}</span>
      </header>

      <div className="hero">
        <div className="cap">Bugungi tushum</div>
        <div className="amt">{som(m.revenueToday)} <small>so'm</small></div>
        <div className="meta">
          <div>Zakazlar<b>{m.ordersToday}</b></div>
          <div>O'rtacha chek<b>{som(m.avg)}</b></div>
        </div>
      </div>

      <div className="tiles">
        <Tile icon="wallet" label="Kassada" value={som(summary?.cashbox ?? 0)} unit="so'm" />
        <Tile icon="store" label="Mijoz qarzi" value={som(totalDebt)} unit="so'm" />
        <Tile icon="box" label="Faol zakaz" value={String(m.active)} unit="ta" />
        <Tile icon="truck" label="Bugun yetkazildi" value={String(m.deliveredToday)} unit="ta" />
      </div>

      <div className="section">
        <h2>Naqd oqimi</h2>
        <div className="pipe">
          <Pcard icon="truck" label="Driverlarda" v={summary?.drivers ?? 0} />
          <Pcard icon="user" label="Menejerlarda" v={summary?.managers ?? 0} />
          <Pcard icon="clock" label="Kutilmoqda" v={summary?.pending ?? 0} />
          <Pcard icon="checkCircle" label="Bugun kassada" v={summary?.todayIn ?? 0} />
        </div>
      </div>

      <div className="section">
        <h2>Top mahsulotlar</h2>
        <div className="card">
          {m.top.length === 0 && <div className="muted">Ma'lumot yo'q</div>}
          {m.top.map((p) => (
            <div className="prow" key={p.name}>
              <div className="head">
                <span className="nm">{p.name}</span>
                <span className="qty">{p.qty} dona</span>
                <span className="rev">{som(p.rev)}</span>
              </div>
              <div className="bar"><span style={{ width: `${Math.round((p.qty / m.maxQty) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Qarzdor kompaniyalar</h2>
        <div className="card">
          {debtors.length === 0 && <div className="muted ico-text"><Icon name="checkCircle" size={15} /> Qarzdor yo'q</div>}
          {debtors.slice(0, 6).map((c) => (
            <div className="rowitem" key={c.id}>
              <span className="ico-text"><Icon name="store" size={16} /> {c.name}</span>
              <span className="mono bal--debt">{som(c.balance)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Xodimlar (bu oy)</h2>
        <div className="card">
          <div className="rowitem"><span className="ico-text"><Icon name="user" size={16} /> Oylik fondi</span><span className="mono" style={{ fontWeight: 700 }}>{som(wageBill)}</span></div>
          <div className="rowitem"><span className="ico-text"><Icon name="wallet" size={16} /> To'langan (bu oy)</span><span className="mono" style={{ fontWeight: 700 }}>{som(paidThisMonth)}</span></div>
          <div className="rowitem"><span className="ico-text"><Icon name="clock" size={16} /> Qolgan</span><span className="mono" style={{ fontWeight: 700 }}>{som(Math.max(0, wageBill - paidThisMonth))}</span></div>
        </div>
      </div>

      <div className="foot">Faqat ko'rish · egasi</div>
    </div>
  );
}

function Tile({ icon, label, value, unit }: { icon: 'wallet' | 'store' | 'box' | 'truck'; label: string; value: string; unit: string }) {
  return (
    <div className="tile">
      <div className="l"><Icon name={icon} size={15} /> {label}</div>
      <div className="v">{value} <small>{unit}</small></div>
    </div>
  );
}
function Pcard({ icon, label, v }: { icon: 'truck' | 'user' | 'clock' | 'checkCircle'; label: string; v: number }) {
  return <div className="pcard"><div className="l"><Icon name={icon} size={15} /> {label}</div><div className="v">{som(v)}</div></div>;
}
