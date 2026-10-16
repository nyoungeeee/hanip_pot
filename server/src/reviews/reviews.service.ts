import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { nowIso } from '../common/event';
import { fail } from '../common/errors';
import { SessionUser } from '../auth/session.service';

export type Verdict = 'GOOD' | 'MEH';
export const HIDE_REASONS = ['ABUSE', 'AD', 'OFFTOPIC', 'PRIVACY'] as const;
export type HideReason = (typeof HIDE_REASONS)[number];

export const REVIEW_RULES = { bodyMin: 5, bodyMax: 200 } as const;

/** 공개 노출 조건: 작성자 삭제·운영자 숨김·탈퇴 회원 제외. r = reviews, u = 작성자 */
export const REVIEW_PUBLIC_WHERE = `r.deleted_at IS NULL AND r.hidden_at IS NULL AND u.withdrawn_at IS NULL`;

// 후기는 텍스트만. 링크·오픈카톡·전화번호로 다른 곳에 모으는 글은 받지 않는다.
const CONTACT_RE = /(https?:\/\/|www\.|open\.kakao|kakao\.com|\.(com|kr|net|io|me)\b|01[016789][-.\s]?\d{3,4}[-.\s]?\d{4})/i;

interface ReviewRow {
  id: number;
  menu_id: number;
  author_id: number;
  body: string;
  verdict: Verdict;
  created_at: string;
  hidden_at: string | null;
  hidden_reason: HideReason | null;
  nickname: string;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  private toPublic(r: ReviewRow, viewer: SessionUser | null) {
    return {
      id: r.id,
      body: r.body,
      verdict: r.verdict,
      createdAt: r.created_at,
      nickname: r.nickname,
      isMine: viewer?.id === r.author_id,
      // 숨김 정보는 운영자에게만
      hidden: viewer?.isAdmin && r.hidden_at ? { reason: r.hidden_reason } : null,
    };
  }

  /** 메뉴 상세: 메뉴 정보, 후기 요약, 후기 목록(운영자는 숨긴 것 포함), 내 후기 여부 */
  menuDetail(menuId: number, viewer: SessionUser | null) {
    const menu = this.db
      .prepare(`
        SELECT m.id, m.name, m.price, m.is_official, m.menu_image, m.active,
               v.id AS vendor_id, v.name AS vendor_name, v.vendor_image, v.zone, v.is_official AS vendor_official
        FROM menus m JOIN vendors v ON v.id = m.vendor_id WHERE m.id = ?`)
      .get(menuId) as {
        id: number; name: string; price: number | null; is_official: number; menu_image: string | null; active: number;
        vendor_id: number; vendor_name: string; vendor_image: string | null; zone: string | null; vendor_official: number;
      } | undefined;
    if (!menu || (menu.is_official && !menu.active)) fail(404, 'NOT_FOUND', '메뉴를 찾을 수 없어요.');

    const where = viewer?.isAdmin ? 'r.deleted_at IS NULL AND u.withdrawn_at IS NULL' : REVIEW_PUBLIC_WHERE;
    const rows = this.db
      .prepare(`
        SELECT r.*, u.nickname FROM reviews r JOIN users u ON u.id = r.author_id
        WHERE r.menu_id = ? AND ${where}
        ORDER BY r.created_at DESC, r.id DESC`)
      .all(menuId) as ReviewRow[];
    const visible = rows.filter((r) => !r.hidden_at);
    const mine = viewer
      ? (this.db
          .prepare('SELECT id, hidden_at FROM reviews WHERE menu_id = ? AND author_id = ? AND deleted_at IS NULL')
          .get(menuId, viewer.id) as { id: number; hidden_at: string | null } | undefined)
      : undefined;

    return {
      menu: {
        id: menu.id, name: menu.name, price: menu.price, isOfficial: !!menu.is_official,
        vendorId: menu.vendor_id, vendorName: menu.vendor_name, vendorIsOfficial: !!menu.vendor_official, zone: menu.zone,
        image: menu.menu_image ?? menu.vendor_image,
      },
      summary: {
        count: visible.length,
        good: visible.filter((r) => r.verdict === 'GOOD').length,
        meh: visible.filter((r) => r.verdict === 'MEH').length,
      },
      reviews: rows.map((r) => this.toPublic(r, viewer)),
      myReview: mine ? { id: mine.id, hidden: !!mine.hidden_at } : null,
      rules: REVIEW_RULES,
    };
  }

  create(menuId: number, user: SessionUser, raw: unknown) {
    const b = (raw ?? {}) as { body?: unknown; verdict?: unknown };
    const body = typeof b.body === 'string' ? b.body.trim().replace(/\n{3,}/g, '\n\n') : '';
    const len = [...body].length;
    if (b.verdict !== 'GOOD' && b.verdict !== 'MEH') fail(400, 'INVALID_REVIEW', '추천해요 또는 아쉬워요를 골라 주세요.');
    if (len < REVIEW_RULES.bodyMin || len > REVIEW_RULES.bodyMax) {
      fail(400, 'INVALID_REVIEW', `후기는 ${REVIEW_RULES.bodyMin}~${REVIEW_RULES.bodyMax}자로 써 주세요.`);
    }
    if (CONTACT_RE.test(body)) fail(400, 'INVALID_REVIEW', '링크나 연락처는 후기에 넣을 수 없어요.');

    const menu = this.db.prepare('SELECT is_official, active FROM menus WHERE id = ?').get(menuId) as
      { is_official: number; active: number } | undefined;
    if (!menu || (menu.is_official && !menu.active)) fail(404, 'NOT_FOUND', '메뉴를 찾을 수 없어요.');
    const exists = this.db.prepare('SELECT 1 FROM reviews WHERE menu_id = ? AND author_id = ? AND deleted_at IS NULL').get(menuId, user.id);
    if (exists) fail(409, 'REVIEW_EXISTS', '이 메뉴에는 이미 후기를 남겼어요. 다시 쓰려면 내정보 > 내 후기에서 지운 뒤 써 주세요.');

    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO reviews (menu_id, author_id, body, verdict, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(menuId, user.id, body, b.verdict, nowIso());
    return { id: Number(lastInsertRowid) };
  }

  /** 내 후기: 숨김 포함(사유는 빼고 상태만), 삭제한 것은 제외 */
  mine(userId: number) {
    const rows = this.db
      .prepare(`
        SELECT r.id, r.body, r.verdict, r.created_at, r.hidden_at, m.id AS menu_id, m.name AS menu_name, v.name AS vendor_name
        FROM reviews r JOIN menus m ON m.id = r.menu_id JOIN vendors v ON v.id = m.vendor_id
        WHERE r.author_id = ? AND r.deleted_at IS NULL
        ORDER BY r.created_at DESC, r.id DESC`)
      .all(userId) as { id: number; body: string; verdict: Verdict; created_at: string; hidden_at: string | null; menu_id: number; menu_name: string; vendor_name: string }[];
    return rows.map((r) => ({
      id: r.id, body: r.body, verdict: r.verdict, createdAt: r.created_at,
      status: r.hidden_at ? 'HIDDEN' : 'PUBLIC',
      menu: { id: r.menu_id, name: r.menu_name, vendorName: r.vendor_name },
    }));
  }

  remove(id: number, userId: number) {
    const { changes } = this.db
      .prepare('UPDATE reviews SET deleted_at = ? WHERE id = ? AND author_id = ? AND deleted_at IS NULL')
      .run(nowIso(), id, userId);
    if (!changes) fail(404, 'NOT_FOUND', '후기를 찾을 수 없어요.');
  }

  hide(id: number, admin: SessionUser, raw: unknown) {
    const reason = (raw as { reason?: unknown } | null)?.reason;
    if (!HIDE_REASONS.includes(reason as HideReason)) fail(400, 'INVALID_REASON', '숨기는 이유를 골라 주세요.');
    const { changes } = this.db
      .prepare('UPDATE reviews SET hidden_at = ?, hidden_by = ?, hidden_reason = ? WHERE id = ? AND deleted_at IS NULL')
      .run(nowIso(), admin.id, reason, id);
    if (!changes) fail(404, 'NOT_FOUND', '후기를 찾을 수 없어요.');
  }

  unhide(id: number) {
    const { changes } = this.db
      .prepare('UPDATE reviews SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE id = ? AND deleted_at IS NULL')
      .run(id);
    if (!changes) fail(404, 'NOT_FOUND', '후기를 찾을 수 없어요.');
  }
}
