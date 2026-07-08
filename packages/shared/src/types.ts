// Frozen B2B contract — DTOs. Shared by backend and all frontends. Do not redefine elsewhere.

import { DeliveryType, OrderStatus, PaymentType, Role } from './enums.js';

export interface Product {
  id: string;
  posterId: string;
  name: string;
  category: string;
  basePrice: number;
  cost: number; // from Poster ingredients; stored now, UI use is a later sub-project
  unit: string;
  isStopped: boolean; // stop-list
}

export interface ClientLocation {
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

export interface Client {
  id: string;
  name: string;
  contactName: string;
  contactPhone: string;
  locations: ClientLocation[];
  balance: number; // derived: SUM(charge) - SUM(payment)
  notes?: string;
}

export interface ClientPrice {
  productId: string;
  price: number;
}

// A product enriched with the client's price. clientPrice === null => not offered to this client.
export interface OfferedProduct extends Product {
  clientPrice: number | null;
}

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number; // snapshot at order creation; editable before Ready
  lineTotal: number;
}

export interface Order {
  id: string;
  clientId: string;
  clientName: string;
  createdBy: string; // user id (manager)
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  paymentType: PaymentType;
  deliveryType?: DeliveryType;
  driverId?: string;
  yandexDeeplink?: string; // present when deliveryType === Yandex
  location: ClientLocation;
  contactPhone: string;
  portions: number;
  notes?: string;
  posterOrderId?: string; // set after Ready writeback
  cashCollected?: boolean; // driver marks on delivery for cash orders
  cashHandedOver?: boolean; // driver handed cash to manager; awaiting manager accept (Close)
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface LedgerEntry {
  id: string;
  clientId: string;
  orderId?: string;
  type: 'charge' | 'payment';
  amount: number;
  method?: string; // for payments: cash | transfer | ...
  note?: string;
  createdBy: string;
  createdAt: string; // ISO
}

export interface User {
  id: string;
  telegramId: string;
  role: Role;
  name: string;
  phone?: string;
}
