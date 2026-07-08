// Typed WebSocket client with auto-reconnect. Emits contract ServerEvents.
import type { ServerEvent, Subscribe } from '@b2b/shared';

export function connectOrders(url: string, sub: Subscribe, onEvent: (e: ServerEvent) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => ws?.send(JSON.stringify(sub));
    ws.onmessage = (m) => {
      try { onEvent(JSON.parse(m.data) as ServerEvent); } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (!closed) retry = setTimeout(open, 1500);
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    ws?.close();
  };
}
