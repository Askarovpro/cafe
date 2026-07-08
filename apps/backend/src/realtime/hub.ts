import type { Order, ServerEvent, Subscribe } from '@b2b/shared';

type SocketLike = {
  readyState: number;
  OPEN: number;
  send(data: string): void;
};

export class RealtimeHub {
  private subscribers = new Map<SocketLike, Subscribe>();

  subscribe(socket: SocketLike, subscription: Subscribe): void {
    this.subscribers.set(socket, subscription);
  }

  unsubscribe(socket: SocketLike): void {
    this.subscribers.delete(socket);
  }

  broadcast(event: ServerEvent): void {
    for (const [socket, subscription] of this.subscribers) {
      if (socket.readyState === socket.OPEN && isRelevant(subscription, event.order)) {
        socket.send(JSON.stringify(event));
      }
    }
  }
}

export function isRelevant(subscription: Subscribe, order: Order): boolean {
  if (subscription.subscribe === 'kds') return !['closed', 'cancelled'].includes(order.status);
  if (subscription.subscribe === 'manager') return order.createdBy === subscription.userId;
  return order.driverId === subscription.driverId;
}
