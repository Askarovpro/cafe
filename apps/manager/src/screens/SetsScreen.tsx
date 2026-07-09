import { useEffect, useMemo, useState } from 'react';
import type { MenuSet, OfferedProduct } from '@b2b/shared';
import { Icon, som } from '@b2b/web-kit';
import { api } from '../api.js';

export function SetsScreen() {
  const [sets, setSets] = useState<MenuSet[]>([]);
  const [products, setProducts] = useState<OfferedProduct[]>([]);
  const [adding, setAdding] = useState(false);

  const load = () => api.sets().then(setSets).catch(() => {});
  useEffect(() => { load(); api.products().then(setProducts).catch(() => {}); }, []);

  const del = (id: string) => {
    if (!confirm("To'plamni o'chirasizmi?")) return;
    api.updateSet(id, { active: false }).then(load).catch(() => {});
  };

  return (
    <>
      {!adding && <button className="btn btn--block" onClick={() => setAdding(true)}><Icon name="plus" size={20} /> Yangi to'plam</button>}
      {adding && <Builder products={products} onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}

      {sets.map((s) => (
        <div className="card" key={s.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {s.image && <img src={s.image} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flex: 'none' }} />}
            <h3 style={{ margin: 0 }}>{s.name}</h3>
            <span className="mono" style={{ marginLeft: 'auto', fontWeight: 700 }}>{som(s.basePrice)}</span>
            <button className="rm" onClick={() => del(s.id)} aria-label="o'chirish" style={{ border: 0, background: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', padding: 0 }}>×</button>
          </div>
          {s.description && <div className="muted" style={{ marginTop: 6 }}>{s.description}</div>}
          <div style={{ marginTop: 8 }}>
            {s.components.map((c) => (
              <div className="docket__row" key={c.productId} style={{ padding: '4px 0', fontSize: 14 }}>
                <span>{c.name}</span><span className="q">{c.qty}×</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {sets.length === 0 && !adding && <div className="empty">To'plam yo'q. «Yangi to'plam» tuzing.</div>}
    </>
  );
}

async function fileToDataUrl(file: File, maxW = 480): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function Builder({ products, onDone, onCancel }: { products: OfferedProduct[]; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [comps, setComps] = useState<{ productId: string; name: string; qty: number }[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [image, setImage] = useState('');

  const cats = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const matches = useMemo(() => {
    const inList = new Set(comps.map((c) => c.productId));
    const ql = q.trim().toLowerCase();
    if (!cat && !ql) return [];
    return products
      .filter((p) => !inList.has(p.id) && !p.isStopped && (!cat || p.category === cat) && (!ql || p.name.toLowerCase().includes(ql)))
      .slice(0, 40);
  }, [q, cat, products, comps]);

  const add = (p: OfferedProduct) => { setComps((c) => [...c, { productId: p.id, name: p.name, qty: 1 }]); setQ(''); };
  const setQty = (id: string, qty: number) => setComps((c) => c.map((x) => (x.productId === id ? { ...x, qty: Math.max(1, qty) } : x)));
  const remove = (id: string) => setComps((c) => c.filter((x) => x.productId !== id));

  const save = async () => {
    if (!name || comps.length === 0) return;
    await api.createSet({ name, description: desc || undefined, basePrice: Number(price) || 0, image: image || undefined, components: comps.map((c) => ({ productId: c.productId, qty: c.qty })) });
    onDone();
  };

  return (
    <div className="card">
      <h3>Yangi to'plam</h3>
      <div className="field"><label>Nomi<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Biznes-lanch" /></label></div>
      <div className="row2" style={{ marginTop: 10 }}>
        <label>Narx (baza)<input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>Tavsif<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ixtiyoriy" /></label>
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label>Rasm (ixtiyoriy)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {image
            ? <img src={image} alt="" style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover' }} />
            : <div style={{ width: 60, height: 60, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}><Icon name="box" size={22} /></div>}
          <label className="btn btn--ghost" style={{ flex: '0 0 auto', cursor: 'pointer' }}>
            {image ? 'Almashtirish' : 'Rasm tanlash'}
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f).then(setImage).catch(() => {}); }} />
          </label>
          {image && <button className="rm" onClick={() => setImage('')} style={{ border: 0, background: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>×</button>}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label style={{ marginBottom: 2 }}>Menyudan qo'shish (Poster mahsulot / tex card)</label>
        <div className="row2">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Barcha kategoriya</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="qidirish…" />
        </div>
        {!cat && !q.trim() && <div className="muted" style={{ marginTop: 6 }}>Kategoriya tanlang yoki qidiring.</div>}
        {matches.length > 0 && (
          <div className="card" style={{ padding: 6, marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
            {matches.map((p) => (
              <div key={p.id} className="rowitem" style={{ cursor: 'pointer', padding: '9px 6px' }} onClick={() => add(p)}>
                <span>{p.name}<br /><span className="muted" style={{ fontSize: 12 }}>{p.category}</span></span>
                <span className="muted mono">{som(p.basePrice)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {comps.length > 0 && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {comps.map((c) => (
            <div key={c.productId} className="rowitem" style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px' }}>
              <span>{c.name}</span>
              <span className="qty" style={{ marginLeft: 'auto' }}>
                <button onClick={() => setQty(c.productId, c.qty - 1)}>−</button>
                <span className="n">{c.qty}</span>
                <button onClick={() => setQty(c.productId, c.qty + 1)}>+</button>
                <button className="rm" onClick={() => remove(c.productId)} style={{ border: 0, background: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="split" style={{ marginTop: 14 }}>
        <button className="btn btn--ghost" onClick={onCancel}>Bekor</button>
        <button className="btn" disabled={!name || comps.length === 0} onClick={save}>Saqlash</button>
      </div>
    </div>
  );
}
