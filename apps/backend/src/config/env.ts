export type Env = {
  databaseUrl?: string;
  posterToken: string;
  posterSpotId: number;
  botToken: string;
  jwtSecret: string;
  port: number;
  devAuth: boolean;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    databaseUrl: source.DATABASE_URL,
    posterToken: source.POSTER_TOKEN ?? '',
    posterSpotId: Number(source.POSTER_SPOT_ID ?? 1),
    botToken: source.BOT_TOKEN ?? '',
    jwtSecret: source.JWT_SECRET ?? 'dev-secret-change-me',
    port: Number(source.PORT ?? 3000),
    devAuth: source.DEV_AUTH === '1',
  };
}
