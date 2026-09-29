import { Controller, Get, Inject, Logger, Post, Query, Req, Res } from '@nestjs/common';
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { AppConfig, CONFIG } from '../config';
import { GenderCheck, KakaoClient, KakaoIdentity } from './kakao.client';
import { SessionService } from './session.service';
import { UsersService } from './users.service';

const STATE_COOKIE = 'hp_oauth';

/** 로그인 후 돌아갈 곳은 앱 내부 경로만 허용(오픈 리다이렉트 방지). */
export function safeReturnTo(v: unknown): string {
  if (typeof v !== 'string') return '/';
  if (!/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/.test(v)) return '/';
  if (v.startsWith('/api') || v.startsWith('/auth') || v.startsWith('/welcome')) return '/';
  return v.length > 200 ? '/' : v;
}

@Controller('auth')
export class AuthController {
  private readonly log = new Logger('Auth');

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly kakao: KakaoClient,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
  ) {}

  @Get('kakao/login')
  login(@Query('returnTo') returnTo: string, @Query('consent') consent: string, @Res() res: Response) {
    const state = crypto.randomBytes(16).toString('base64url');
    res.cookie(STATE_COOKIE, JSON.stringify({ state, returnTo: safeReturnTo(returnTo) }), {
      ...this.sessions.cookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
    if (this.cfg.authMock) return res.redirect(`/api/auth/mock?state=${state}`);
    res.redirect(this.kakao.authorizeUrl(state, consent === 'gender'));
  }

  @Get('kakao/callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    let saved: { state?: string; returnTo?: string } = {};
    try {
      saved = JSON.parse(req.cookies?.[STATE_COOKIE] ?? '{}');
    } catch {}
    res.clearCookie(STATE_COOKIE, this.sessions.cookieOptions());
    const returnTo = safeReturnTo(saved.returnTo);
    const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

    // 사용자가 동의 화면에서 취소한 경우
    if (error) return res.redirect(`/auth/denied?${q({ reason: 'cancelled', returnTo })}`);
    if (!code || !state || !saved.state || state !== saved.state) {
      return res.redirect(`/auth/denied?${q({ reason: 'error', returnTo })}`);
    }

    let identity: KakaoIdentity;
    try {
      identity = this.cfg.authMock && code.startsWith('mock:') ? this.mockIdentity(code) : await this.kakao.identify(code);
    } catch (e) {
      this.log.warn(`카카오 로그인 실패: ${(e as Error).message}`);
      return res.redirect(`/auth/denied?${q({ reason: 'error', returnTo })}`);
    }

    if (identity.gender !== 'female') {
      // 계정·세션을 만들지 않는다. 성별 값도 저장하지 않는다.
      return res.redirect(`/auth/denied?${q({ reason: identity.gender, returnTo })}`);
    }

    // 기존 세션이 있었다면 교체
    this.sessions.destroy(req, res);
    const user = this.users.upsertVerified(identity.kakaoId);
    this.sessions.create(res, user.id);
    // 첫 로그인 후 닉네임 확인 없이 나갔던 경우에도 다시 닉네임 화면(A3)으로 보낸다
    const confirmed = !user.isNew && this.users.isNicknameConfirmed(user.id);
    res.redirect(confirmed ? returnTo : `/welcome?${q({ returnTo })}`);
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    this.sessions.destroy(req, res);
    res.json({ ok: true });
  }

  // ---- 개발 전용 모의 로그인(AUTH_MOCK=1, 운영에서는 기동 자체가 거부됨) ----

  @Get('mock')
  mockPage(@Query('state') state: string, @Res() res: Response) {
    if (!this.cfg.authMock) return res.status(404).end();
    const s = encodeURIComponent(state ?? '');
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>모의 카카오 로그인</title>
<body style="font-family:sans-serif;padding:24px;max-width:360px;margin:auto">
<h3>모의 카카오 로그인 (개발용)</h3>
<form action="/api/auth/mock/go" method="get">
<input type="hidden" name="state" value="${s}">
<p><label>카카오 id <input name="kid" value="1001" required></label></p>
<p><label>성별 <select name="g"><option value="female">female</option><option value="male">male</option><option value="none">(제공 안 함)</option></select></label></p>
<button>로그인</button></form>
<p><a href="/api/auth/kakao/callback?error=access_denied&state=${s}">동의 취소 흉내</a></p></body>`);
  }

  @Get('mock/go')
  mockGo(@Query('state') state: string, @Query('kid') kid: string, @Query('g') g: string, @Res() res: Response) {
    if (!this.cfg.authMock) return res.status(404).end();
    const code = `mock:${String(kid).replace(/[^0-9a-z]/gi, '')}:${g}`;
    res.redirect(`/api/auth/kakao/callback?${new URLSearchParams({ code, state: state ?? '' })}`);
  }

  private mockIdentity(code: string): KakaoIdentity {
    const [, kakaoId, g] = code.split(':');
    const gender: GenderCheck = g === 'female' ? 'female' : g === 'none' ? 'missing' : 'other';
    return { kakaoId: `mock-${kakaoId}`, gender };
  }
}
