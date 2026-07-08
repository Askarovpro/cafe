import type { Order } from '@b2b/shared';
import { OrderStatus } from '@b2b/shared';
import { STATUS_COLOR, STATUS_LABEL, som } from './status.js';

export function StatusChip({ status }: { status: OrderStatus }) {
  return (
    <span className="chip" style={{ background: STATUS_COLOR[status] }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`mono ${className}`}>{som(value)}</span>;
}

// The signature order-ticket. `actions` render under the body (per-app buttons).
export function Docket({
  order,
  showStatus = true,
  actions,
}: {
  order: Order;
  showStatus?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="docket">
      <div className="docket__head">
        <span className="docket__id">#{order.id}</span>
        <span style={{ color: 'var(--muted)' }}>· {order.portions}p</span>
        <span style={{ flex: 1 }} />
        {showStatus && <StatusChip status={order.status} />}
      </div>
      <div className="docket__body">
        <div style={{ fontWeight: 650, marginBottom: 6 }}>{order.clientName}</div>
        {order.items.map((it) => (
          <div className="docket__row" key={it.productId}>
            <span>{it.name}</span>
            <span className="q">
              {it.qty}× <Money value={it.unitPrice} />
            </span>
          </div>
        ))}
        <div className="docket__row" style={{ borderTop: '1px dashed var(--line)', marginTop: 6, paddingTop: 8, fontWeight: 700 }}>
          <span>Jami</span>
          <Money value={order.total} />
        </div>
        {actions && <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>{actions}</div>}
      </div>
    </div>
  );
}
