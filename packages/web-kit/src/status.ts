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
