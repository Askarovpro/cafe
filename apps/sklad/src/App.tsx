import { useMemo, useState, useEffect } from 'react';
import type { Ingredient } from '@b2b/shared';
import { ApiClient, Icon, initTelegram } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const api = new ApiClient(API);
const DEV_USER = import.meta.env.VITE_DEV_USER ?? 'w1';
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type Tab = 'sklad' | 'bozor';

export function App() {
  const [ready, setReady] = useState(false);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [tab, setTab] = useState<Tab>('sklad');

  useEffect(() => {
    const { initData, inTelegram } = initTelegram();
    api.authTelegram(inTelegram ? initData : `dev:${DEV_USER}`).then((r) => { api.setToken(r.token); setReady(true); }).catch(() => setReady(true));
  }, []);
  const load = () => api.ingredients().then(setIngs).catch(() => {});
  useEffect(() => { if (ready) load(); }, [ready]);

  const low = ings.filter((i) => i.isLow);

  return (
    <div className="wrap">
      <header className="appbar">
        <div className="mark"><Icon name="box" size={20} /></div>
        <div><div className="title">Sklad</div><div className="sub">Ombor · bozorlik</div></div>
        {low.length > 0 ? <span className="warn">{low.length} kam</span> : <span className="ok">To'liq</span>}
      </header>

      {tab === 'sklad' && <Sklad ings={ings} onDone={load} />}
      {tab === 'bozor' && <Bozorlik low={low} onDone={load} />}

      <nav className="nav">
        <button data-active={tab === 'sklad'} onClick={() => setTab('sklad')}><Icon name="box" size={20} /> Sklad</button>
        <button data-active={tab === 'bozor'} onClick={() => setTab('bozor')}>
          {low.length > 0 && <span className="badge">{low.length}</span>}
          <Icon name="bag" size={20} /> Bozorlik
        </button>
      </nav>
    </div>
  );
}

function Sklad({ ings, onDone }: { ings: Ingredient[]; onDone: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', unit: 'kg', stock: '', minStock: '', supplier: '' });

  const create = async () => {
    if (!f.name || !f.unit || !f.supplier) return;
    await api.createIngredient({ name: f.name, unit: f.unit, stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0, supplier: f.supplier });
    setF({ name: '', unit: 'kg', stock: '', minStock: '', supplier: '' }); setAdding(false); onDone();
  };

  return (
    <>
      {!adding && <button className="btn btn--block" style={{ marginBottom: 14 }} onClick={() => setAdding(true)}><Icon name="plus" size={20} /> Yangi mahsulot</button>}
      {adding && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Yangi mahsulot</h3>
          <div className="row2"><label>Nomi<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Birlik<input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="kg" /></label></div>
          <div className="row2" style={{ marginTop: 10 }}><label>Qoldiq<input type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></label>
            <label>Min<input type="number" value={f.minStock} onChange={(e) => setF({ ...f, minStock: e.target.value })} /></label></div>
          <label style={{ marginTop: 10 }}>Postavshik<input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></label>
          <div className="split" style={{ marginTop: 12 }}><button className="btn btn--ghost" onClick={() => setAdding(false)}>Bekor</button><button className="btn" onClick={create}>Saqlash</button></div>
        </div>
      )}

      <div className="list">
        {ings.map((i) => (
          <div className="ing" key={i.id}>
            <div className="ing__row" onClick={() => setOpenId(openId === i.id ? null : i.id)}>
              <span className={`dot ${i.isLow ? 'dot--low' : 'dot--ok'}`} />
              <div><div className="nm">{i.name}</div><div className="meta">min {num(i.minStock)} {i.unit} · {i.supplier}</div></div>
              <div className="qty">
                <div className={`big ${i.isLow ? 'low' : ''}`}>{num(i.stock)} {i.unit}</div>
                {i.isLow && <span className="badge">kam qoldi</span>}
              </div>
            </div>
            {openId === i.id && <AdjustPanel ing={i} onDone={() => { setOpenId(null); onDone(); }} />}
          </div>
        ))}
      </div>
    </>
  );
}

function AdjustPanel({ ing, onDone }: { ing: Ingredient; onDone: () => void }) {
  const [delta, setDelta] = useState('');
  const [min, setMin] = useState(String(ing.minStock));
  const apply = (sign: 1 | -1) => {
    const d = Number(delta);
    if (!d) return;
    api.adjustStock(ing.id, { delta: sign * Math.abs(d) }).then(onDone).catch(() => {});
  };
  const saveMin = () => api.updateIngredient(ing.id, { minStock: Number(min) || 0 }).then(onDone).catch(() => {});
  return (
    <div className="adjust">
      <div className="stepper">
        <button className="pm" onClick={() => setDelta(String((Number(delta) || 0) - 1))}>−</button>
        <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="miqdor" />
        <button className="pm" onClick={() => setDelta(String((Number(delta) || 0) + 1))}>+</button>
      </div>
      <div className="split">
        <button className="btn" disabled={!Number(delta)} onClick={() => apply(1)}>Kirim (+)</button>
        <button className="btn btn--dark" disabled={!Number(delta)} onClick={() => apply(-1)}>Chiqim (−)</button>
      </div>
      <div className="split" style={{ alignItems: 'end' }}>
        <label>Min chegara<input type="number" value={min} onChange={(e) => setMin(e.target.value)} /></label>
        <button className="btn btn--ghost" style={{ flex: '0 0 auto' }} onClick={saveMin}>Saqlash</button>
      </div>
    </div>
  );
}

function Bozorlik({ low, onDone }: { low: Ingredient[]; onDone: () => void }) {
  const groups = useMemo(() => {
    const m: Record<string, Ingredient[]> = {};
    for (const i of low) (m[i.supplier] ??= []).push(i);
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [low]);

  const buy = (i: Ingredient) => {
    const need = Math.max(0, i.minStock - i.stock);
    api.adjustStock(i.id, { delta: need, reason: 'xarid' }).then(onDone).catch(() => {});
  };

  if (low.length === 0) return <div className="empty"><div className="big"><Icon name="checkCircle" size={30} /></div>Hammasi yetarli. Xarid shart emas.</div>;

  return (
    <>
      <div className="sectiontitle">Kam qolgan — postavshik bo'yicha</div>
      {groups.map(([supplier, items]) => (
        <div className="supplier" key={supplier}>
          <h3><Icon name="store" size={16} /> {supplier}</h3>
          {items.map((i) => (
            <div className="shoprow" key={i.id}>
              <span className="dot dot--low" />
              <div><div className="nm">{i.name}</div><div className="meta muted">qoldi {num(i.stock)} · min {num(i.minStock)} {i.unit}</div></div>
              <span className="need">+{num(Math.max(0, i.minStock - i.stock))} {i.unit}</span>
              <button className="btn tiny buy" onClick={() => buy(i)}>Oldim</button>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
