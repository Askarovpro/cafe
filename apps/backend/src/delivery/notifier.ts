import { Bot } from 'grammy';

export interface Notifier {
  notifyUser(userId: string, text: string): Promise<void>;
}

export class NoopNotifier implements Notifier {
  async notifyUser(): Promise<void> {
    return undefined;
  }
}

export class GrammyNotifier implements Notifier {
  private readonly bot: Bot;

  constructor(
    botToken: string,
    private readonly resolveTelegramChatId: (userId: string) => Promise<string | undefined>,
  ) {
    this.bot = new Bot(botToken);
  }

  async notifyUser(userId: string, text: string): Promise<void> {
    const chatId = await this.resolveTelegramChatId(userId);
    if (chatId) await this.bot.api.sendMessage(chatId, text);
  }
}

export function yandexDeeplink(lat?: number, lng?: number): string {
  if (lat == null || lng == null) return 'https://yandex.uz/maps/';
  return `https://yandex.uz/maps/?rtext=~${lat},${lng}&rtt=auto`;
}
