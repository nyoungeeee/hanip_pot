import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AppConfig, CONFIG } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'warn', 'error'] });
  const cfg = app.get<AppConfig>(CONFIG);
  const log = new Logger('Http');

  if (cfg.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'", 'https://kauth.kakao.com'],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: cfg.production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use(cookieParser());

  // API: 캐시 금지 + 쓰기 요청은 커스텀 헤더/Origin으로 CSRF 차단. 로그에는 쿼리스트링(OAuth code 등)을 남기지 않는다.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    res.on('finish', () => {
      if (res.statusCode >= 500) log.error(`${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${Date.now() - started}ms`);
    });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('x-hanippot') !== '1' || (origin && origin !== cfg.publicUrl)) {
        return res.status(403).json({ code: 'CSRF', message: '잘못된 요청이에요.' });
      }
    }
    next();
  });

  app.setGlobalPrefix('api');

  // 정적 리소스: 업체 대표 사진(시드), 사용자 업로드, 프론트 빌드
  app.useStaticAssets(path.join(cfg.seedDir, 'vendor-images'), { prefix: '/media/vendors/', maxAge: '7d' });
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  app.useStaticAssets(cfg.uploadDir, { prefix: '/uploads/', maxAge: '30d', immutable: true });
  const indexHtml = path.join(cfg.webDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.useStaticAssets(path.join(cfg.webDist, 'assets'), { prefix: '/assets/', maxAge: '1y', immutable: true });
    app.useStaticAssets(cfg.webDist, { index: false, maxAge: '1h' });
    // SPA 폴백: /api 이외의 HTML 요청은 index.html
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/media')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    new Logger('Bootstrap').warn(`프론트 빌드 없음(${cfg.webDist}) — API만 제공`);
  }

  app.enableShutdownHooks();
  await app.listen(cfg.port, '0.0.0.0');
  new Logger('Bootstrap').log(`listening :${cfg.port} (${cfg.production ? 'production' : 'dev'}${cfg.authMock ? ', AUTH_MOCK' : ''})`);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
