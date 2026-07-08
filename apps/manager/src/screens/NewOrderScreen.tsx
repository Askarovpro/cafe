import { useEffect, useMemo, useState } from 'react';
import { PaymentType } from '@b2b/shared';
import type { Client, OfferedProduct, Order } from '@b2b/shared';
import { Money, som } from '@b2b/web-kit';
import { api } from '../api.js';

const PAY_LABEL: Record<PaymentType, string> = {
  [PaymentType.Cash]: 'Naqd', [PaymentType.Transfer]: "O'tkazma", [PaymentType.Prepaid]: 'Oldindan',
};

export function NewOrderScreen({ onCreated }: { onCreated: (o: Order) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [products, setProducts] = useState<OfferedProduct[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [portions, setPortions] = useState(1);
  const [locIdx, setLocIdx] = useState(0);
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState<PaymentType>(PaymentType.Cash);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.clients().then(setClients).catch(() => {}); }, []);

  const client = clients.find((c) => c.id === clientId);
  useEffect(() => {
    setQty({}); setLocIdx(0);
    if (!clientId) { setProducts([]); return; }
    setPhone(client?.contactPhone ?? '');
    api.products(clientId).then((p) => setProducts(p.filter((x) => x.clientPrice !== null && !x.isStopped))).catch(() => {});
  }, [clientId]);

  const items = useMemo(
    () => products.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ product: p, qty: qty[p.id]! })),
    [products, qty],
  );
  const total = items.reduce((s, it) => s + (it.product.clientPrice ?? 0) * it.qty, 0);

  const bump = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));

  const submit = async () => {
    if (!client || items.length === 0) return;
    setBusy(true);
    try {
      const order = await api.createOrder({
        clientId: client.id,
        items: items.map((it) => ({ productId: it.product.id, qty: it.qty })),
        portions,
        location: client.locations[locIdx],
        contactPhone: phone,
        paymentType: payment,
        notes: notes || undefined,
      });
      onCreated(order);
    } catch (e) {
      alert((e as Error).message ?? 'Xatolik');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="field">
        <label>Mijoz
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— tanlang —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {client && (
        <>
          <div className="card">
            <h3>Mahsulotlar</h3>
            {products.length === 0 && <div className="muted">Bu mijozga narx belgilanmagan. «Mijozlar» → narx qo'ying.</div>}
            {products.map((p) => (
              <div className="docket__row" key={p.id} style={{ alignItems: 'center', padding: '8px 0' }}>
                <span>{p.name}<br /><span className="muted mono">{som(p.clientPrice!)} so'm</span></span>
                <span className="qty">
                  <button onClick={() => bump(p.id, -1)} aria-label="kamaytir">−</button>
                  <span className="n">{qty[p.id] ?? 0}</span>
                  <button onClick={() => bump(p.id, +1)} aria-label="ko'paytir">+</button>
                </span>
              </div>
            ))}
          </div>

          <div className="row2">
            <label>Porsiya
              <input type="number" min={1} value={portions} onChange={(e) => setPortions(Math.max(1, +e.target.value))} />
            </label>
            <label>To'lov
              <select value={payment} onChange={(e) => setPayment(e.target.value as PaymentType)}>
                {Object.values(PaymentType).map((p) => <option key={p} value={p}>{PAY_LABEL[p]}</option>)}
              </select>
            </label>
          </div>

          <label>Manzil
            <select value={locIdx} onChange={(e) => setLocIdx(+e.target.value)}>
              {client.locations.map((l, i) => <option key={i} value={i}>{l.label} — {l.address}</option>)}
            </select>
          </label>
          <label>Kontakt telefon
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998…" />
          </label>
          <label>Izoh (ixtiyoriy)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <button className="btn btn--block" disabled={busy || items.length === 0 || !phone} onClick={submit}>
            {items.length === 0 ? 'Mahsulot tanlang' : <>Zakaz yaratish · <Money value={total} /> so'm</>}
          </button>
        </>
      )}
    </>
  );
}
