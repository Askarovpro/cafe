import { ApiClient, initTelegram } from '@b2b/web-kit';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
export const WS = API.replace(/^http/, 'ws') + '/ws';
export const api = new ApiClient(API);

// Own drivers. No GET /drivers in the contract yet — configured for MVP.
// ponytail: hardcoded list, replace with a /drivers endpoint when driver roster grows.
export const DRIVERS: { id: string; name: string }[] = [{ id: 'd1', name: 'Botir' }];

const DEV_USER = import.meta.env.VITE_DEV_USER ?? 'u1'; // manager, for local dev-auth outside Telegram

export async function authenticate(): Promise<string> {
  const { initData, inTelegram } = initTelegram();
  const r = await api.authTelegram(inTelegram ? initData : `dev:${DEV_USER}`);
  api.setToken(r.token);
  return r.user.id;
}
