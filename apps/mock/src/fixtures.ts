import type { Client, ClientPrice, Product, User } from '@b2b/shared';
import { Role } from '@b2b/shared';

export const products: Product[] = [
  { id: 'p1', posterId: '101', name: 'Osh (porsiya)', category: 'Milliy', basePrice: 35000, cost: 18000, unit: 'porsiya', isStopped: false },
  { id: 'p2', posterId: '102', name: 'Manti (5 dona)', category: 'Milliy', basePrice: 30000, cost: 14000, unit: 'porsiya', isStopped: false },
  { id: 'p3', posterId: '103', name: 'Lag‘mon', category: 'Milliy', basePrice: 32000, cost: 15000, unit: 'porsiya', isStopped: false },
  { id: 'p4', posterId: '104', name: 'Somsa', category: 'Pech', basePrice: 12000, cost: 5000, unit: 'dona', isStopped: false },
  { id: 'p5', posterId: '105', name: 'Choy (choynak)', category: 'Ichimlik', basePrice: 8000, cost: 2000, unit: 'choynak', isStopped: false },
];

export const clients: Client[] = [
  { id: 'c1', name: 'Oq Saroy MChJ', contactName: 'Aziz aka', contactPhone: '+998901112233', locations: [{ label: 'Ofis', address: 'Toshkent, Chilonzor 5', lat: 41.29, lng: 69.2 }], balance: 0 },
  { id: 'c2', name: 'Bahor Cafe', contactName: 'Dilnoza', contactPhone: '+998907778899', locations: [{ label: 'Filial 1', address: 'Toshkent, Yunusobod 12', lat: 41.36, lng: 69.28 }], balance: 0 },
];

// Per-client prices (individual). c1 gets cheaper osh; c2 has no custom prices yet.
export const clientPrices: Record<string, ClientPrice[]> = {
  c1: [
    { productId: 'p1', price: 32000 },
    { productId: 'p2', price: 28000 },
    { productId: 'p4', price: 11000 },
  ],
  c2: [],
};

export const users: User[] = [
  { id: 'u1', telegramId: '1001', role: Role.Manager, name: 'Menejer', phone: '+998900000001' },
  { id: 'u2', telegramId: '1002', role: Role.Kitchen, name: 'Oshxona', phone: '+998900000002' },
  { id: 'd1', telegramId: '2001', role: Role.Driver, name: 'Botir (driver)', phone: '+998900000003' },
  { id: 'f1', telegramId: '3001', role: Role.Finance, name: 'Moliyachi', phone: '+998900000004' },
];
