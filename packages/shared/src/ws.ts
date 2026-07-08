// Frozen B2B contract — WebSocket events.

import type { Order } from './types.js';

// Client -> server: sent once after connect to pick a channel.
export type Subscribe =
  | { subscribe: 'kds' } // all active orders (kitchen monitor)
  | { subscribe: 'manager'; userId: string } // orders created by this manager
  | { subscribe: 'driver'; driverId: string }; // orders assigned to this driver

// Server -> client.
export type ServerEvent =
  | { type: 'order.created'; order: Order }
  | { type: 'order.updated'; order: Order };
