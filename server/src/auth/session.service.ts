import { Inject, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { AppConfig, CONFIG } from '../config';
import { DatabaseService } from '../db/database.service';
import { nowIso } from '../common/event';

export const SESSION_COOKIE = 'hp_sid';

export interface SessionUser {
  id: number;
  nickname: string;
  nicknameConfirmed: boolean;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly database: DatabaseService,
  ) {}

  private hash(token: string): string {
    return crypto.createHmac('sha256', this.cfg.sessionSecret).update(token).digest('hex');
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.cfg.publicUrl.startsWith('https://'),
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  create(res: Response, userId: number) {
    const token = crypto.randomBytes(32).toString('base64url');
    const maxAge = this.cfg.sessionDays * 24 * 60 * 60 * 1000;
    const expires = new Date(Date.now() + maxAge).toISOString();
    this.database.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(this.hash(token), userId, nowIso(), expires);
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge });
  }

  /** 쿠키의 세션을 서버에서 검증. 만료·탈퇴 계정이면 null. */
  resolve(req: Request): SessionUser | null {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) return null;
    const row = this.database.db
      .prepare(`
        SELECT u.id, u.nickname, u.nickname_confirmed
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.withdrawn_at IS NULL`)
      .get(this.hash(token), nowIso()) as { id: number; nickname: string; nickname_confirmed: number } | undefined;
    if (!row) return null;
    return { id: row.id, nickname: row.nickname, nicknameConfirmed: !!row.nickname_confirmed };
  }

  destroy(req: Request, res: Response) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token) {
      this.database.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(this.hash(token));
    }
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  destroyAllFor(userId: number) {
    this.database.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  purgeExpired() {
    this.database.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
  }
}
