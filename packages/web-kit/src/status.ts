import { OrderStatus } from '@b2b/shared';

// Uzbek labels + color var per status. Single source for all apps.
export const STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.New]: 'Yangi',
  [OrderStatus.Preparing]: 'Tayyorlanmoqda',
  [OrderStatus.Ready]: 'Tayyor',
  [OrderStatus.Assigned]: 'Biriktirildi',
  [OrderStatus.Delivering]: "Yo'lda",
  [OrderStatus.Delivered]: 'Yetkazildi',
  [OrderStatus.Closed]: 'Yopildi',
  [OrderStatus.Cancelled]: 'Bekor',
};

// Restrained chip tone per status — gold (active), grey (waiting), green (done), red (cancel).
// Keeps the mobile UI cohesive instead of a rainbow of hues.
export type ChipTone = 'active' | 'idle' | 'done' | 'cancel';
export const CHIP_TONE: Record<OrderStatus, ChipTone> = {
  [OrderStatus.New]: 'idle',
  [OrderStatus.Preparing]: 'active',
  [OrderStatus.Ready]: 'active',
  [OrderStatus.Assigned]: 'idle',
  [OrderStatus.Delivering]: 'active',
  [OrderStatus.Delivered]: 'active',
  [OrderStatus.Closed]: 'done',
  [OrderStatus.Cancelled]: 'cancel',
};

// Full-hue map — still used by the KDS wall monitor where distinct column colors help.
export const STATUS_COLOR: Record<OrderStatus, string> = {
  [OrderStatus.New]: 'var(--st-new)',
  [OrderStatus.Preparing]: 'var(--st-preparing)',
  [OrderStatus.Ready]: 'var(--st-ready)',
  [OrderStatus.Assigned]: 'var(--st-assigned)',
  [OrderStatus.Delivering]: 'var(--st-delivering)',
  [OrderStatus.Delivered]: 'var(--st-delivered)',
  [OrderStatus.Closed]: 'var(--st-closed)',
  [OrderStatus.Cancelled]: 'var(--st-cancelled)',
};

// UZS formatting, e.g. 540000 -> "540 000"
export const som = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
