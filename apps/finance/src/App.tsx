import { useEffect, useMemo, useState } from 'react';
import { EXPENSE_CATEGORIES, MoneyMovementType, OrderAction, OrderStatus, PaymentType, PayoutKind, CashCustody } from '@b2b/shared';
import type { Client, MoneyMovement, MoneySummary, Order, Staff as StaffT } from '@b2b/shared';
import { ApiClient, Icon, connectOrders, initTelegram, som } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws') + '/ws';
const api = new ApiClient(API);
const DEV_USER = import.meta.env.VITE_DEV_USER ?? 'f1';
const DRIVERS: Record<string, string> = { d1: 'Botir' };
const driverName = (id?: string) => (id ? DRIVERS[id] ?? id : '—');

type Tab = 'confirm' | 'kassa' | 'staff' | 'reports';

export function App() {
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [summary, setSummary] = useState<MoneySummary | null>(null);
  const [movements, setMovements] = useState<MoneyMovement[]>([]);
  const [staff, setStaff] = useState<StaffT[]>([]);
  const [tab, setTab] = useState<Tab>('confirm');

  useEffect(() => {
    const { initData, inTelegram } = initTelegram();
    api.authTelegram(inTelegram ? initData : `dev:${DEV_USER}`)
      .then((r) => { api.setToken(r.token); setReady(true); }).catch(() => setReady(true));
  }, []);

  const loadMoney = () => {
    api.moneySummary().then(setSummary).catch(() => {});
    api.moneyMovements(40).then(setMovements).catch(() => {});
  };
  const loadStaff = () => api.staff().then(setStaff).catch(() => {});
  useEffect(() => {
    if (!ready) return;
    api.orders().then((l) => setOrders(Object.fromEntries(l.map((o) => [o.id, o])))).catch(() => {});
    api.clients().then(setClients).catch(() => {});
    loadMoney();
    loadStaff();
    return connectOrders(WS, { subscribe: 'kds' }, (e) => setOrders((p) => ({ ...p, [e.order.id]: e.order })));
  }, [ready]);

  const pending = useMemo(
    () => Object.values(orders).filter((o) => o.paymentType === PaymentType.Cash && o.status === OrderStatus.Delivered && o.cashCustody === CashCustody.Finance),
    [orders],
  );
  const pendingT = pending.reduce((s, o) => s + o.total, 0);
  const debtors = clients.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
  const totalDebt = debtors.reduce((s, c) => s + c.balance, 0);

  const confirm = (o: Order) =>
    api.transition(o.id, { action: OrderAction.CashConfirm }).then((u) => { setOrders((p) => ({ ...p, [u.id]: u })); loadMoney(); }).catch(() => {});
  const confirmAll = () => Promise.all(pending.map(confirm)).catch(() => {});

  return (
    <div className="wrap">
      <header className="appbar">
        <div className="mark"><Icon name="wallet" size={20} /></div>
        <div><div className="title">Moliyachi</div><div className="sub">Kassa · naqd</div></div>
        {summary && <span className="count">{som(summary.cashbox)} so'm</span>}
      </header>

      {tab === 'confirm' && <Confirm pending={pending} pendingT={pendingT} onConfirm={confirm} onAll={confirmAll} />}
      {tab === 'kassa' && <Kassa summary={summary} movements={movements} onDone={loadMoney} />}
      {tab === 'staff' && <Staff staff={staff} onDone={() => { loadStaff(); loadMoney(); }} />}
      {tab === 'reports' && <Reports summary={summary} debtors={debtors} totalDebt={totalDebt} />}

      <nav className="nav">
        <button data-active={tab === 'confirm'} onClick={() => setTab('confirm')}><Icon name="money" size={20} /> Naqd</button>
        <button data-active={tab === 'kassa'} onClick={() => setTab('kassa')}><Icon name="wallet" size={20} /> Kassa</button>
        <button data-active={tab === 'staff'} onClick={() => setTab('staff')}><Icon name="user" size={20} /> Xodimlar</button>
        <button data-active={tab === 'reports'} onClick={() => setTab('reports')}><Icon name="chart" size={20} /> Hisobot</button>
      </nav>
    </div>
  );
}

function Confirm({ pending, pendingT, onConfirm, onAll }: { pending: Order[]; pendingT: number; onConfirm: (o: Order) => void; onAll: () => void }) {
  return (
    <>
      <div className="cashhero">
        <div className="cap">Tasdiq kutilmoqda (menejerlardan)</div>
        <div className="amt">{som(pendingT)} <small>so'm</small></div>
        {pending.length > 0 && <button className="btn btn--block" onClick={onAll}><Icon name="checkCircle" size={20} /> Hammasini oldim</button>}
      </div>
      {pending.length === 0 && <div className="empty"><div className="big"><Icon name="checkCircle" size={30} /></div>Qabul qilinadigan naqd yo'q.</div>}
      <div className="list">
        {pending.map((o) => (
          <div className="ocard" key={o.id}>
            <div className="ocard__top">
              <span className="ocard__id">#{o.id.length > 8 ? o.id.slice(-4).toUpperCase() : o.id}</span>
              <span style={{ flex: 1 }} />
              <span className="muted ico-text"><Icon name="truck" size={15} /> {driverName(o.driverId)}</span>
            </div>
            <div className="ocard__client">{o.clientName}</div>
            <div className="drows"><div className="drow"><span className="ico"><Icon name="money" size={20} /></span>
              <div><div className="lbl">Naqd</div><div className="val">{som(o.total)} so'm</div></div></div></div>
            <div className="ocard__foot"><button className="btn btn--block" onClick={() => onConfirm(o)}><Icon name="checkCircle" size={18} /> Pulni oldim</button></div>
          </div>
        ))}
      </div>
    </>
  );
}

function Kassa({ summary, movements, onDone }: { summary: MoneySummary | null; movements: MoneyMovement[]; onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Kassirdan');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const a = Number(amount);
    if (!a || a <= 0) return;
    setBusy(true);
    try {
      if (mode === 'in') await api.recordIncome({ amount: a, category: category || 'Kassirdan', note: note || undefined });
      else await api.recordExpense({ amount: a, category, note: note || undefined });
      setAmount(''); setNote(''); onDone();
    } catch (e) { alert((e as Error).message ?? 'Xatolik'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="cashhero">
        <div className="cap ico-text"><Icon name="wallet" size={16} /> Kassa balansi</div>
        <div className="amt">{som(summary?.cashbox ?? 0)} <small>so'm</small></div>
        {summary && <div className="cap" style={{ marginTop: 6 }}>Bugun: +{som(summary.todayIn)} · −{som(summary.todayOut)}</div>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="segbtns">
          <button className={mode === 'in' ? 'btn' : 'btn btn--ghost'} onClick={() => { setMode('in'); setCategory('Kassirdan'); }}><Icon name="plus" size={16} /> Kirim</button>
          <button className={mode === 'out' ? 'btn btn--dark' : 'btn btn--ghost'} onClick={() => { setMode('out'); setCategory('Xarajat'); }}><Icon name="minus" size={16} /> Chiqim</button>
        </div>
        <label style={{ marginTop: 12 }}>Summa<input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></label>
        <label style={{ marginTop: 10 }}>Turi
          {mode === 'in'
            ? <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kassirdan" />
            : <select value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
        </label>
        <label style={{ marginTop: 10 }}>Izoh<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" /></label>
        <button className="btn btn--block" style={{ marginTop: 14 }} disabled={busy || !Number(amount)} onClick={submit}>
          {mode === 'in' ? 'Kirim yozish' : 'Chiqim yozish'}{amount ? ` · ${som(Number(amount) || 0)} so'm` : ''}
        </button>
      </div>

      <div className="sectiontitle">Harakatlar</div>
      <div className="card">
        {movements.length === 0 && <div className="muted">Harakat yo'q</div>}
        {movements.map((m) => {
          const inn = m.type === MoneyMovementType.Income || (m.type === MoneyMovementType.Transfer && !!m.toAccountId && !m.fromAccountId);
          const kind = m.type === MoneyMovementType.Income ? 'in' : m.type === MoneyMovementType.Expense ? 'out' : 'tr';
          return (
            <div className="mvrow" key={m.id}>
              <span className={`ic ic--${kind}`}><Icon name={kind === 'in' ? 'plus' : kind === 'out' ? 'minus' : 'wallet'} size={18} /></span>
              <div>
                <div className="cat">{m.category ?? (m.type === MoneyMovementType.Transfer ? 'O‘tkazma' : m.type)}</div>
                <div className="sub">{m.note ?? new Date(m.createdAt).toLocaleString('uz-UZ')}</div>
              </div>
              <span className={`amt ${m.type === MoneyMovementType.Expense ? 'amt--out' : m.type === MoneyMovementType.Income ? 'amt--in' : ''}`}>
                {m.type === MoneyMovementType.Expense ? '−' : m.type === MoneyMovementType.Income ? '+' : ''}{som(m.amount)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Reports({ summary, debtors, totalDebt }: { summary: MoneySummary | null; debtors: Client[]; totalDebt: number }) {
  return (
    <>
      <div className="pipe">
        <Pcard icon="truck" label="Driverlarda" v={summary?.drivers ?? 0} />
        <Pcard icon="user" label="Menejerlarda" v={summary?.managers ?? 0} />
        <Pcard icon="clock" label="Kutilmoqda" v={summary?.pending ?? 0} />
        <Pcard icon="checkCircle" label="Bugun kassada" v={summary?.todayIn ?? 0} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Driver bo'yicha (kassaga tushmagan)</h3>
        {(!summary || summary.byDriver.length === 0) && <div className="muted">Yo'q</div>}
        {summary?.byDriver.map((d) => (
          <div className="rowitem" key={d.userId}>
            <span className="ico-text"><Icon name="truck" size={16} /> {driverName(d.userId)}</span>
            <span className="mono" style={{ fontWeight: 700 }}>{som(d.amount)}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Qarzdor kompaniyalar · jami {som(totalDebt)} so'm</h3>
        {debtors.length === 0 && <div className="muted ico-text"><Icon name="checkCircle" size={15} /> Qarzdor yo'q</div>}
        {debtors.map((c) => (
          <div className="rowitem" key={c.id}>
            <span className="ico-text"><Icon name="store" size={16} /> {c.name}</span>
            <span className="mono bal--debt">{som(c.balance)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Staff({ staff, onDone }: { staff: StaffT[]; onDone: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', position: '', salary: '' });
  const [kind, setKind] = useState<PayoutKind>(PayoutKind.Advance);
  const [amount, setAmount] = useState('');

  const create = async () => {
    if (!f.name || !f.position) return;
    await api.createStaff({ name: f.name, position: f.position, salary: Number(f.salary) || 0 });
    setF({ name: '', position: '', salary: '' }); setAdding(false); onDone();
  };
  const pay = async (s: StaffT) => {
    const a = Number(amount);
    if (!a || a <= 0) return;
    await api.payStaff(s.id, { kind, amount: a, note: undefined }).catch((e) => alert((e as Error).message));
    setAmount(''); setOpenId(null); onDone();
  };

  return (
    <>
      {!adding && <button className="btn btn--block" onClick={() => setAdding(true)}><Icon name="plus" size={20} /> Yangi xodim</button>}
      {adding && (
        <div className="card">
          <h3>Yangi xodim</h3>
          <div className="row2"><label>Ism<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Lavozim<input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="Oshpaz" /></label></div>
          <label style={{ marginTop: 10 }}>Oylik<input type="number" value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} placeholder="0" /></label>
          <div className="split" style={{ marginTop: 12 }}>
            <button className="btn btn--ghost" onClick={() => setAdding(false)}>Bekor</button>
            <button className="btn" onClick={create}>Saqlash</button>
          </div>
        </div>
      )}

      <div className="list" style={{ marginTop: 14 }}>
        {staff.map((s) => (
          <div key={s.id}>
            <div className="staffrow" data-open={openId === s.id} onClick={() => setOpenId(openId === s.id ? null : s.id)}>
              <span className="av"><Icon name="user" size={22} /></span>
              <div><div className="nm">{s.name}</div><div className="pos">{s.position} · oylik {som(s.salary)}</div></div>
              <div className="bal">
                <div className="q" style={{ color: s.balance > 0 ? 'var(--ink)' : 'var(--st-ready)' }}>{som(s.balance)}</div>
                <div className="cap">qoldiq · avans {som(s.advancesThisMonth)}</div>
              </div>
            </div>
            {openId === s.id && (
              <div className="paypanel">
                <div className="segbtns">
                  <button className={kind === PayoutKind.Advance ? 'btn' : 'btn btn--ghost'} onClick={() => setKind(PayoutKind.Advance)}>Avans</button>
                  <button className={kind === PayoutKind.Salary ? 'btn' : 'btn btn--ghost'} onClick={() => setKind(PayoutKind.Salary)}>Oylik</button>
                </div>
                <label style={{ marginTop: 10 }}>Summa<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></label>
                <button className="btn btn--block" style={{ marginTop: 12 }} disabled={!Number(amount)} onClick={() => pay(s)}>
                  {kind === PayoutKind.Advance ? 'Avans berish' : 'Oylik berish'}{amount ? ` · ${som(Number(amount) || 0)} so'm` : ''}
                </button>
              </div>
            )}
          </div>
        ))}
        {staff.length === 0 && !adding && <div className="empty">Xodim yo'q. «Yangi xodim» qo'shing.</div>}
      </div>
    </>
  );
}

function Pcard({ icon, label, v }: { icon: 'truck' | 'user' | 'clock' | 'checkCircle'; label: string; v: number }) {
  return (
    <div className="pcard">
      <div className="l"><Icon name={icon} size={15} /> {label}</div>
      <div className="v">{som(v)}</div>
    </div>
  );
}
