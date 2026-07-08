import { createHmac, timingSafeEqual } from 'node:crypto';
import { unauthorized } from '../errors.js';

export type TelegramUserData = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function validateTelegramInitData(initData: string, botToken: string): TelegramUserData {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw unauthorized('missing Telegram hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!safeEqualHex(hash, expected)) throw unauthorized('invalid Telegram initData');

  const rawUser = params.get('user');
  if (!rawUser) throw unauthorized('missing Telegram user');
  return JSON.parse(rawUser) as TelegramUserData;
}

export function createTelegramInitData(user: TelegramUserData, botToken: string, authDate: number): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test-query',
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function safeEqualHex(leftHex: string, rightHex: string): boolean {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
