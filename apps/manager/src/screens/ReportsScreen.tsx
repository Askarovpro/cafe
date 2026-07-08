import { useEffect, useMemo, useState } from 'react';
import { OrderStatus } from '@b2b/shared';
import type { Client, Order } from '@b2b/shared';
import { som } from '@b2b/web-kit';
import { api } from '../api.js';

// Charged = reached Ready (revenue committed to Poster + ledger).
const CHARGED = new Set<OrderStatus>([
  OrderStatus.Ready, OrderStatus.Assigned, OrderStatus.Delivering, OrderStatus.Delivered, OrderStatus.Closed,
]);

export function ReportsScreen({ orders }: { orders: Record<string, Order> }) {
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => { api.clients().then(setClients).catch(() => {}); }, []);

  const stats = useMemo(() => {
    const all = Object.values(orders);
    const charged = all.filter((o) => CHARGED.has(o.status));
    return {
      revenue: charged.reduce((s, o) => s + o.total, 0),
      chargedCount: charged.length,
      active: all.filter((o) => o.status !== OrderStatus.Closed && o.status !== OrderStatus.Cancelled).length,
    };
  }, [orders]);

  const debtors = clients.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
  const totalDebt = debtors.reduce((s, c) => s + c.balance, 0);

  return (
    <>
      <div className="row2">
        <Stat label="Tushum (charged)" value={`${som(stats.revenue)}`} unit="so'm" />
        <Stat label="Zakazlar" value={String(stats.chargedCount)} unit={`${stats.active} faol`} />
      </div>

      <div className="card">
        <h3>Qarzdorlar · jami {som(totalDebt)} so'm</h3>
        {debtors.length === 0 && <div className="muted">Qarzdor yo'q 🎉</div>}
        {debtors.map((c) => (
          <div className="docket__row" key={c.id} style={{ padding: '8px 0' }}>
            <span>{c.name}</span>
            <span className="mono bal--debt" style={{ fontWeight: 700 }}>{som(c.balance)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div className="muted" style={{ fontSize: 12 }}>{unit}</div>
    </div>
  );
}
