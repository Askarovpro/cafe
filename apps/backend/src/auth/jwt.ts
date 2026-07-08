import { createHmac, timingSafeEqual } from 'node:crypto';
import { unauthorized } from '../errors.js';

export type JwtPayload = {
  sub: string;
  telegramId: string;
  role: string;
  exp: number;
};

export function signJwt(payload: Omit<JwtPayload, 'exp'>, secret: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body: JwtPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedBody = base64Url(JSON.stringify(body));
  const signature = hmac(`${encodedHeader}.${encodedBody}`, secret);
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  const [encodedHeader, encodedBody, signature] = token.split('.');
  if (!encodedHeader || !encodedBody || !signature) throw unauthorized();
  const expected = hmac(`${encodedHeader}.${encodedBody}`, secret);
  if (!safeEqual(signature, expected)) throw unauthorized();
  const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8')) as JwtPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw unauthorized('token expired');
  return payload;
}

function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function base64Url(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
