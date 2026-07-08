import { useEffect, useState } from 'react';
import type { Client } from '@b2b/shared';
import { som } from '@b2b/web-kit';
import { api } from '../api.js';

export function ClientsScreen({ onOpen }: { onOpen: (c: Client) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', contactName: '', contactPhone: '', label: 'Ofis', address: '' });

  const load = () => api.clients().then(setClients).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!f.name || !f.contactPhone || !f.address) return;
    await api.createClient({
      name: f.name, contactName: f.contactName, contactPhone: f.contactPhone,
      locations: [{ label: f.label, address: f.address }],
    });
    setF({ name: '', contactName: '', contactPhone: '', label: 'Ofis', address: '' });
    setAdding(false);
    load();
  };

  return (
    <>
      {!adding && <button className="btn btn--block" onClick={() => setAdding(true)}>＋ Yangi mijoz</button>}

      {adding && (
        <div className="card">
          <h3>Yangi mijoz</h3>
          <div className="field"><label>Kompaniya nomi<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label></div>
          <div className="row2" style={{ marginTop: 10 }}>
            <label>Mas'ul shaxs<input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></label>
            <label>Telefon<input value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} placeholder="+998…" /></label>
          </div>
          <div className="row2" style={{ marginTop: 10 }}>
            <label>Manzil nomi<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
            <label>Manzil<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
          </div>
          <div className="split" style={{ marginTop: 12 }}>
            <button className="btn btn--ghost" onClick={() => setAdding(false)}>Bekor</button>
            <button className="btn" onClick={create}>Saqlash</button>
          </div>
        </div>
      )}

      {clients.map((c) => (
        <div key={c.id} className="listrow" onClick={() => onOpen(c)}>
          <div>
            <div style={{ fontWeight: 650 }}>{c.name}</div>
            <div className="sub">{c.contactName} · {c.contactPhone}</div>
          </div>
          <span className={`bal ${c.balance > 0 ? 'bal--debt' : 'bal--ok'}`}>{som(c.balance)}</span>
        </div>
      ))}
    </>
  );
}
