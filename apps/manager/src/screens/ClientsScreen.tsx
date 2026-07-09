import { useEffect, useState } from 'react';
import type { Client } from '@b2b/shared';
import { Icon, som } from '@b2b/web-kit';
import { api } from '../api.js';
import { MapPicker } from '../MapPicker.js';

export function ClientsScreen({ onOpen }: { onOpen: (c: Client) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [adding, setAdding] = useState(false);
  const empty = { name: '', contactName: '', contactPhone: '', label: 'Ofis', address: '', lat: undefined as number | undefined, lng: undefined as number | undefined };
  const [f, setF] = useState(empty);

  const load = () => api.clients().then(setClients).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!f.name || !f.contactPhone || !f.address) return;
    await api.createClient({
      name: f.name, contactName: f.contactName, contactPhone: f.contactPhone,
      locations: [{ label: f.label, address: f.address, lat: f.lat, lng: f.lng }],
    });
    setF(empty);
    setAdding(false);
    load();
  };

  return (
    <>
      {!adding && (
        <button className="btn btn--block" onClick={() => setAdding(true)}>
          <Icon name="plus" size={20} /> Yangi mijoz
        </button>
      )}

      {adding && (
        <div className="card">
          <h3>Yangi mijoz</h3>
          <div className="field"><label>Kompaniya nomi<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label></div>
          <div className="row2" style={{ marginTop: 10 }}>
            <label>Mas'ul shaxs<input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></label>
            <label>Telefon<input value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} placeholder="+998…" /></label>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Manzil nomi<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label style={{ marginBottom: 2 }}>Manzil — xaritadan tanlang</label>
            <MapPicker onChange={({ lat, lng, address }) => setF((p) => ({ ...p, lat, lng, address: address || p.address }))} />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Manzil (matn)<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Xaritadan avto-to'ladi" /></label>
            {f.lat != null && <div className="muted mono ico-text"><Icon name="pin" size={14} /> {f.lat.toFixed(5)}, {f.lng!.toFixed(5)}</div>}
          </div>
          <div className="split" style={{ marginTop: 12 }}>
            <button className="btn btn--ghost" onClick={() => setAdding(false)}>Bekor</button>
            <button className="btn" onClick={create}>Saqlash</button>
          </div>
        </div>
      )}

      {clients.map((c) => (
        <div key={c.id} className="listrow" onClick={() => onOpen(c)}>
          <span className="avatar"><Icon name="store" size={22} /></span>
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
