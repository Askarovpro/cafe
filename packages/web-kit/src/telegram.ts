// Telegram Mini App bootstrap. Reads initData + applies the user's theme so the
// app feels native. Safe to call outside Telegram (dev in a plain browser).

interface TgWebApp {
  initData: string;
  themeParams: Record<string, string>;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
}

function tg(): TgWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

export function initTelegram(): { initData: string; inTelegram: boolean } {
  const app = tg();
  if (!app) return { initData: '', inTelegram: false };
  app.ready();
  app.expand();
  // Map Telegram theme params to our CSS vars (already referenced in tokens.css).
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(app.themeParams)) {
    root.setProperty(`--tg-theme-${k.replace(/_/g, '-')}`, v);
  }
  document.documentElement.dataset.tgScheme = app.colorScheme;
  return { initData: app.initData, inTelegram: true };
}
