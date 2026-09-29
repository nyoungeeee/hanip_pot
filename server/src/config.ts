import path from 'node:path';

export interface AppConfig {
  production: boolean;
  port: number;
  publicUrl: string;
  dataDir: string;
  uploadDir: string;
  webDist: string;
  seedDir: string;
  sessionSecret: string;
  sessionDays: number;
  trustProxy: boolean;
  authMock: boolean;
  kakao: {
    restApiKey: string;
    clientSecret: string;
    redirectUri: string;
    adminKey: string;
  };
}

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export function loadConfig(): AppConfig {
  const production = env('NODE_ENV') === 'production';
  const publicUrl = env('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
  const root = path.resolve(__dirname, '..');
  const cfg: AppConfig = {
    production,
    port: Number(env('PORT', '3000')),
    publicUrl,
    dataDir: path.resolve(env('DATA_DIR', path.join(root, '.data'))),
    uploadDir: path.resolve(env('UPLOAD_DIR', path.join(root, '.uploads'))),
    webDist: path.resolve(env('WEB_DIST', path.join(root, '..', 'web', 'dist'))),
    seedDir: path.resolve(env('SEED_DIR', path.join(root, 'seed'))),
    sessionSecret: env('SESSION_SECRET'),
    sessionDays: 7,
    trustProxy: env('TRUST_PROXY', production ? '1' : '0') === '1',
    authMock: env('AUTH_MOCK') === '1',
    kakao: {
      restApiKey: env('KAKAO_REST_API_KEY'),
      clientSecret: env('KAKAO_CLIENT_SECRET'),
      redirectUri: env('KAKAO_REDIRECT_URI', `${publicUrl}/api/auth/kakao/callback`),
      adminKey: env('KAKAO_ADMIN_KEY'),
    },
  };

  if (production) {
    const missing: string[] = [];
    if (cfg.sessionSecret.length < 32) missing.push('SESSION_SECRET(32자 이상)');
    if (!cfg.kakao.restApiKey) missing.push('KAKAO_REST_API_KEY');
    if (!publicUrl.startsWith('https://')) missing.push('PUBLIC_URL(https)');
    if (cfg.authMock) missing.push('AUTH_MOCK은 운영에서 사용할 수 없음');
    if (missing.length) throw new Error(`환경변수 확인 필요: ${missing.join(', ')}`);
  } else if (!cfg.sessionSecret) {
    cfg.sessionSecret = 'dev-only-session-secret-change-me-please';
  }
  return cfg;
}

export const CONFIG = Symbol('CONFIG');
