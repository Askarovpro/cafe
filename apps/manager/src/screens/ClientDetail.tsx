import { useEffect, useState } from 'react';
import type { Client, LedgerEntry, OfferedProduct } from '@b2b/shared';
import { Money, som } from '@b2b/web-kit';
import { api } from '../api.js';

export function ClientDetail({ client }: { client: Client }) {
  const [view, setView] = useState<'pricing' | 'ledger'>('pricing');
  return (
    <>
      <div className="split">
        <button className="btn" data-ghost={view !== 'pricing'} onClick={() => setView('pricing')}
          style={view === 'pricing' ? {} : { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)' }}>
          Narxlar
        </button>
        <button className="btn" onClick={() => setView('ledger')}
          style={view === 'ledger' ? {} : { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)' }}>
          Qarz / to'lov
        </button>
      </div>
      {view === 'pricing' ? <Pricing client={client} /> : <Ledger client={client} />}
    </>
  );
}

function Pricing({ client }: { client: Client }) {
  const [products, setProducts] = useState<OfferedProduct[]>([]);
  const [others, setOthers] = useState<Client[]>([]);
  const load = () => api.products(client.id).then(setProducts).catch(() => {});
  useEffect(() => { load(); api.clients().then((c) => setOthers(c.filter((x) => x.id !== client.id))).catch(() => {}); }, [client.id]);

  const save = (productId: string, raw: string) => {
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return;
    api.setPrice(client.id, productId, price).then(load).catch(() => {});
  };

  return (
    <>
      <div className="split">
        <button className="btn btn--ghost" onClick={() => api.seedPricesFromBase(client.id).then(load)}>Bazadan boshla</button>
        <select defaultValue="" onChange={(e) => e.target.value && api.copyPrices(client.id, e.target.value).then(load)}>
          <option value="">Nusxa: mijozdan…</option>
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="card">
        <h3>Narxlar (har mahsulot)</h3>
        {products.map((p) => (
          <div className="docket__row" key={p.id} style={{ alignItems: 'center', padding: '8px 0' }}>
            <span>{p.name}<br /><span className="muted mono">baza {som(p.basePrice)}</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: 130 }}>
              <input
                type="number" defaultValue={p.clientPrice ?? ''} placeholder="—"
                key={`${p.id}:${p.clientPrice}`}
                onBlur={(e) => e.target.value !== '' && save(p.id, e.target.value)}
                style={{ textAlign: 'right' }}
              />
            </span>
          </div>
        ))}
      </div>
      <div className="muted">Narxni kiriting va boshqa joyga bosing — saqlanadi. Bo'sh = taklif qilinmaydi.</div>
    </>
  );
}

function Ledger({ client }: { client: Client }) {
  const [balance, setBalance] = useState(client.balance);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');

  const load = () => api.ledger(client.id).then((r) => { setBalance(r.balance); setEntries([...r.entries].reverse()); }).catch(() => {});
  useEffect(() => { load(); }, [client.id]);

  const pay = () => {
    const a = Number(amount);
    if (!a || a <= 0) return;
    api.recordPayment(client.id, { amount: a, method }).then(() => { setAmount(''); load(); }).catch((e) => alert((e as Error).message));
  };

  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="muted">Joriy qarz</div>
        <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: balance > 0 ? 'var(--st-cancelled)' : 'var(--st-ready)' }}>
          {som(balance)} <span style={{ fontSize: 16 }}>so'm</span>
        </div>
      </div>

      <div className="card">
        <h3>To'lov kiritish</h3>
        <div className="split">
          <input type="number" placeholder="Summa" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Naqd</option>
            <option value="transfer">O'tkazma</option>
          </select>
          <button className="btn" onClick={pay}>Qabul</button>
        </div>
      </div>

      {entries.map((e) => (
        <div className="listrow" key={e.id} style={{ cursor: 'default' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{e.type === 'charge' ? 'Zakaz (qarz)' : `To'lov · ${e.method ?? ''}`}</div>
            <div className="sub">{new Date(e.createdAt).toLocaleString('uz-UZ')}</div>
          </div>
          <span className="bal" style={{ color: e.type === 'charge' ? 'var(--st-cancelled)' : 'var(--st-ready)' }}>
            {e.type === 'charge' ? '+' : '−'}<Money value={e.amount} />
          </span>
        </div>
      ))}
      {entries.length === 0 && <div className="empty">Harakat yo'q</div>}
    </>
  );
}
