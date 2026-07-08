import { Role, type AuthResponse, type User } from '@b2b/shared';
import { unauthorized } from '../errors.js';
import { id } from '../ids.js';
import type { AppRepository } from '../repositories/types.js';
import { signJwt, verifyJwt } from './jwt.js';
import { validateTelegramInitData } from './telegram-init-data.js';

export class AuthService {
  constructor(
    private readonly repo: AppRepository,
    private readonly botToken: string,
    private readonly jwtSecret: string,
    private readonly devAuth: boolean = false,
  ) {}

  async loginTelegram(initData: string): Promise<AuthResponse> {
    if (initData.startsWith('dev:')) {
      const match = /^dev:([^:]+)$/.exec(initData);
      if (!this.devAuth || !match) throw unauthorized('invalid Telegram initData');
      const user = await this.repo.findUserById(match[1]);
      if (!user) throw unauthorized('user not found');
      return { token: this.issueToken(user), user };
    }

    const telegramUser = validateTelegramInitData(initData, this.botToken);
    const telegramId = String(telegramUser.id);
    let user = await this.repo.findUserByTelegramId(telegramId);
    if (!user) {
      user = await this.repo.createUser({
        id: id('user'),
        telegramId,
        role: Role.Manager,
        name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || telegramUser.username || telegramId,
      });
    }
    return { token: this.issueToken(user), user };
  }

  issueToken(user: User): string {
    return signJwt({ sub: user.id, telegramId: user.telegramId, role: user.role }, this.jwtSecret);
  }

  async requireUserFromToken(token: string): Promise<User> {
    const payload = verifyJwt(token, this.jwtSecret);
    const user = await this.repo.findUserById(payload.sub);
    if (!user) throw new Error('user not found');
    return user;
  }
}
