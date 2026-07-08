import type { Order } from '@b2b/shared';
import { OrderStatus } from '@b2b/shared';
import { CHIP_TONE, STATUS_LABEL, som, type ChipTone } from './status.js';

// Short, ticket-style order number. UUID ids -> last 4 chars; short ids kept as-is.
const shortId = (id: string) => (id.length > 8 ? id.slice(-4).toUpperCase() : id);

// Generic restrained chip — reused for order status and custom labels (e.g. cash states).
export function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return <span className={`chip chip--${tone}`}>{children}</span>;
}

export function StatusChip({ status }: { status: OrderStatus }) {
  return <Chip tone={CHIP_TONE[status]}>{STATUS_LABEL[status]}</Chip>;
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
        <span className="docket__id">#{shortId(order.id)}</span>
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
