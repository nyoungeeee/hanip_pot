import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { DatabaseService } from '../db/database.service';
import { fail } from '../common/errors';

const VISITOR_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** 마지막 신호가 이 안에 있으면 "지금 접속 중"으로 센다(브라우저는 1분마다 신호를 보낸다) */
const ONLINE_MS = 3 * 60_000;
/** 시연용 테스트 회원은 가입자 수에서 뺀다 */
const REAL_USER = "u.kakao_id IS NOT NULL AND u.kakao_id NOT LIKE 'testseed-%'";

/** 한국 시간 날짜(YYYY-MM-DD)와 그날 0시의 UTC ISO 시각 */
function kstDay(ms = Date.now()) {
  const day = new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
  return { day, startIso: new Date(`${day}T00:00:00+09:00`).toISOString() };
}

/**
 * 간단한 방문 집계. 브라우저마다 무작위 id를 만들어 보내고, 서버는 그 해시만 날짜별로 남긴다.
 * IP·기기 정보는 저장하지 않는다. 숫자는 운영자에게만 보인다.
 */
@Injectable()
export class VisitsService {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  ping(body: unknown, userId: number | null) {
    const vid = (body as { vid?: unknown } | null)?.vid;
    if (typeof vid !== 'string' || !VISITOR_RE.test(vid)) fail(400, 'VALIDATION', '입력 내용을 확인해 주세요.');
    const visitor = crypto.createHash('sha256').update(vid).digest('hex').slice(0, 32);
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO visits (day, visitor, user_id, first_at, last_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (day, visitor) DO UPDATE SET last_at = excluded.last_at, user_id = COALESCE(excluded.user_id, visits.user_id)`)
      .run(kstDay().day, visitor, userId, now, now);
  }

  stats() {
    const { day, startIso } = kstDay();
    const onlineSince = new Date(Date.now() - ONLINE_MS).toISOString();
    const one = <T>(sql: string, ...args: unknown[]) => this.db.prepare(sql).get(...args) as T;

    const online = one<{ n: number }>('SELECT count(*) n FROM visits WHERE last_at >= ?', onlineSince).n;
    const today = one<{ visitors: number; members: number }>(
      'SELECT count(*) visitors, count(DISTINCT user_id) members FROM visits WHERE day = ?', day);
    const days = this.db
      .prepare('SELECT day, count(*) visitors FROM visits GROUP BY day ORDER BY day DESC LIMIT 7')
      .all() as { day: string; visitors: number }[];
    const signups = one<{ total: number; today: number }>(`
      SELECT count(*) total, coalesce(sum(u.created_at >= ?), 0) today
      FROM users u WHERE ${REAL_USER} AND u.withdrawn_at IS NULL`, startIso);
    const posts = one<{ n: number }>(`SELECT count(*) n FROM posts p JOIN users u ON u.id = p.organizer_id WHERE ${REAL_USER}`).n;
    const reviews = one<{ n: number }>(`SELECT count(*) n FROM reviews r JOIN users u ON u.id = r.author_id WHERE ${REAL_USER} AND r.deleted_at IS NULL`).n;

    return {
      day,
      online,
      today: { visitors: today.visitors, members: today.members },
      days,
      signups: { total: signups.total, today: signups.today },
      posts,
      reviews,
    };
  }
}
