import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { SessionService } from '../auth/session.service';
import {
  GUIDELINE_VERSION, isEventDay, kstToUtcIso, nowIso, POST_RULES, utcIsoToKst,
} from '../common/event';
import { fail } from '../common/errors';

export type PostStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

/**
 * 모임 시각이 지난 OPEN 글은 조회 시점에 CLOSED로 본다.
 * 주기 작업(expireDue)이 같은 조건으로 DB 값을 갱신하므로 두 경로의 결과가 같다.
 */
const EFFECTIVE_STATUS = `CASE WHEN p.status = 'OPEN' AND p.meetup_at <= @now THEN 'CLOSED' ELSE p.status END`;
const EFFECTIVE_REASON = `CASE WHEN p.status = 'OPEN' AND p.meetup_at <= @now THEN 'EXPIRED' ELSE p.close_reason END`;
/** 공개 목록 노출 조건: 취소 제외, 탈퇴 회원 글 제외 */
const PUBLIC_WHERE = `p.status != 'CANCELLED' AND u.withdrawn_at IS NULL`;

const OPEN_CHAT_RE = /^https:\/\/open\.kakao\.com\/o\/[A-Za-z0-9_-]{4,40}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HOURS_MESSAGE = '모임 시간은 행사 운영 시간(오전 10시~밤 12시) 안에서 정해 주세요.';

export interface MenuRef {
  id: number;
  name: string;
  price: number | null;
  vendorId: number;
  vendorName: string;
  isOfficial: boolean;
  image: string | null;
  imageKind: 'menu' | 'vendor' | null;
}

interface PostRow {
  id: number;
  organizer_id: number;
  title: string;
  description: string;
  event_day: string;
  meetup_at: string;
  target_people: number;
  open_chat_url: string;
  status: PostStatus;
  close_reason: 'MANUAL' | 'EXPIRED' | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  nickname: string;
  withdrawn_at: string | null;
}

export interface CustomMenuInput {
  vendorName: string;
  name: string;
  price: number | null;
  uploadId: string | null;
}

export interface PostInput {
  day: string;
  time: string;
  meetupAt: string;
  targetPeople: number;
  title: string;
  description: string;
  openChatUrl: string;
  menuIds: number[];
  customMenus: CustomMenuInput[];
}

@Injectable()
export class PostsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Posts');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
  ) {}

  private get db() {
    return this.database.db;
  }

  onModuleInit() {
    this.expireDue();
    this.timer = setInterval(() => {
      try {
        this.expireDue();
        this.sessions.purgeExpired();
      } catch (e) {
        this.log.error(`주기 작업 실패: ${(e as Error).message}`);
      }
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 모임 시각이 지난 모집중 글을 모집종료(EXPIRED)로 확정 */
  expireDue(now = nowIso()): number {
    return this.db
      .prepare(`UPDATE posts SET status='CLOSED', close_reason='EXPIRED', closed_at=meetup_at, updated_at=@now
                WHERE status='OPEN' AND meetup_at <= @now`)
      .run({ now }).changes;
  }

  // ---------- 조회 ----------

  private menusFor(postIds: number[]): Map<number, MenuRef[]> {
    const out = new Map<number, MenuRef[]>();
    if (!postIds.length) return out;
    const rows = this.db
      .prepare(`
        SELECT pm.post_id, m.id, m.name, m.price, m.is_official, m.menu_image, v.id AS vendor_id, v.name AS vendor_name, v.vendor_image
        FROM post_menus pm JOIN menus m ON m.id = pm.menu_id JOIN vendors v ON v.id = m.vendor_id
        WHERE pm.post_id IN (${postIds.map(() => '?').join(',')})
        ORDER BY m.is_official DESC, v.sort_order, m.sort_order, m.id`)
      .all(...postIds) as Array<{
        post_id: number; id: number; name: string; price: number | null; is_official: number;
        menu_image: string | null; vendor_id: number; vendor_name: string; vendor_image: string | null;
      }>;
    for (const r of rows) {
      const list = out.get(r.post_id) ?? [];
      list.push(toMenuRef(r));
      out.set(r.post_id, list);
    }
    return out;
  }

  /** 공개 요약: 총대 닉네임·오픈카톡 URL·설명·참여 인원 정보는 포함하지 않는다. */
  private toPublic(rows: (PostRow & { eff_status: PostStatus })[]) {
    const menus = this.menusFor(rows.map((r) => r.id));
    return rows.map((r) => {
      const { time } = utcIsoToKst(r.meetup_at);
      return {
        id: r.id,
        title: r.title,
        day: r.event_day,
        time,
        meetupAt: r.meetup_at,
        targetPeople: r.target_people,
        status: r.eff_status,
        menus: menus.get(r.id) ?? [],
      };
    });
  }

  listPublic(day: string, menuId?: number) {
    if (!isEventDay(day)) fail(400, 'INVALID_DAY', '행사 날짜를 선택해 주세요.');
    const rows = this.db
      .prepare(`
        SELECT p.*, ${EFFECTIVE_STATUS} AS eff_status
        FROM posts p JOIN users u ON u.id = p.organizer_id
        ${menuId ? 'JOIN post_menus pm ON pm.post_id = p.id AND pm.menu_id = @menuId' : ''}
        WHERE p.event_day = @day AND ${PUBLIC_WHERE}
        ORDER BY (eff_status = 'OPEN') DESC, p.meetup_at, p.id`)
      .all({ now: nowIso(), day, ...(menuId ? { menuId } : {}) }) as (PostRow & { eff_status: PostStatus })[];
    return this.toPublic(rows);
  }

  timeline(day: string) {
    if (!isEventDay(day)) fail(400, 'INVALID_DAY', '행사 날짜를 선택해 주세요.');
    const rows = this.db
      .prepare(`
        SELECT p.*, ${EFFECTIVE_STATUS} AS eff_status
        FROM posts p JOIN users u ON u.id = p.organizer_id
        WHERE p.event_day = @day AND ${PUBLIC_WHERE}
        ORDER BY p.meetup_at, (eff_status = 'OPEN') DESC, p.id`)
      .all({ now: nowIso(), day }) as (PostRow & { eff_status: PostStatus })[];
    const groups: { time: string; meetupAt: string; posts: ReturnType<PostsService['toPublic']> }[] = [];
    for (const post of this.toPublic(rows)) {
      const last = groups[groups.length - 1];
      if (last && last.meetupAt === post.meetupAt) last.posts.push(post);
      else groups.push({ time: post.time, meetupAt: post.meetupAt, posts: [post] });
    }
    return groups;
  }

  /** 메뉴별 화면: 공식 메뉴 전체 + 그날 공개 글이 있는 기타 메뉴. 메뉴별 모집중/모집종료 건수. */
  vendorsWithCounts(day: string) {
    if (!isEventDay(day)) fail(400, 'INVALID_DAY', '행사 날짜를 선택해 주세요.');
    const counts = this.db
      .prepare(`
        WITH vis AS (
          SELECT p.id, ${EFFECTIVE_STATUS} AS st
          FROM posts p JOIN users u ON u.id = p.organizer_id
          WHERE p.event_day = @day AND ${PUBLIC_WHERE}
        )
        SELECT pm.menu_id, SUM(vis.st = 'OPEN') AS open_count, SUM(vis.st = 'CLOSED') AS closed_count
        FROM post_menus pm JOIN vis ON vis.id = pm.post_id
        GROUP BY pm.menu_id`)
      .all({ now: nowIso(), day }) as { menu_id: number; open_count: number; closed_count: number }[];
    const byMenu = new Map(counts.map((c) => [c.menu_id, c]));

    const menus = this.db
      .prepare(`
        SELECT m.id, m.name, m.price, m.is_official, m.menu_image, m.active,
               v.id AS vendor_id, v.name AS vendor_name, v.vendor_image, v.zone, v.is_official AS vendor_official, v.sort_order AS vendor_sort
        FROM menus m JOIN vendors v ON v.id = m.vendor_id
        ORDER BY v.is_official DESC, v.sort_order, v.id, m.is_official DESC, m.sort_order, m.id`)
      .all() as Array<{
        id: number; name: string; price: number | null; is_official: number; menu_image: string | null; active: number;
        vendor_id: number; vendor_name: string; vendor_image: string | null; zone: string | null; vendor_official: number;
      }>;

    const vendors = new Map<number, {
      id: number; name: string; zone: string | null; isOfficial: boolean; image: string | null;
      menus: (MenuRef & { openCount: number; closedCount: number })[];
    }>();
    for (const m of menus) {
      const c = byMenu.get(m.id);
      const openCount = c?.open_count ?? 0;
      const closedCount = c?.closed_count ?? 0;
      // 공식 메뉴는 모임 유무와 관계없이 항상, 기타 메뉴는 그날 공개 글이 있을 때만
      const visible = m.is_official ? !!m.active : openCount + closedCount > 0;
      if (!visible) continue;
      let v = vendors.get(m.vendor_id);
      if (!v) {
        v = { id: m.vendor_id, name: m.vendor_name, zone: m.zone, isOfficial: !!m.vendor_official, image: m.vendor_image, menus: [] };
        vendors.set(m.vendor_id, v);
      }
      v.menus.push({ ...toMenuRef(m), openCount, closedCount });
    }
    return [...vendors.values()];
  }

  /** 등록 화면용 공식 메뉴 목록(건수 없음) */
  officialMenus() {
    const rows = this.db
      .prepare(`
        SELECT m.id, m.name, m.price, m.is_official, m.menu_image, v.id AS vendor_id, v.name AS vendor_name, v.vendor_image, v.zone
        FROM menus m JOIN vendors v ON v.id = m.vendor_id
        WHERE m.is_official = 1 AND m.active = 1
        ORDER BY v.sort_order, m.sort_order`)
      .all() as Array<Parameters<typeof toMenuRef>[0] & { zone: string | null }>;
    const vendors = new Map<number, { id: number; name: string; zone: string | null; image: string | null; menus: MenuRef[] }>();
    for (const r of rows) {
      let v = vendors.get(r.vendor_id);
      if (!v) vendors.set(r.vendor_id, (v = { id: r.vendor_id, name: r.vendor_name, zone: r.zone, image: r.vendor_image, menus: [] }));
      v.menus.push(toMenuRef(r));
    }
    return [...vendors.values()];
  }

  private getRow(id: number): (PostRow & { eff_status: PostStatus; eff_reason: string | null }) | undefined {
    return this.db
      .prepare(`
        SELECT p.*, u.nickname, u.withdrawn_at, ${EFFECTIVE_STATUS} AS eff_status, ${EFFECTIVE_REASON} AS eff_reason
        FROM posts p JOIN users u ON u.id = p.organizer_id WHERE p.id = @id`)
      .get({ id, now: nowIso() }) as (PostRow & { eff_status: PostStatus; eff_reason: string | null }) | undefined;
  }

  private full(row: NonNullable<ReturnType<PostsService['getRow']>>, viewerId: number, includeUrlAlways: boolean) {
    const [pub] = this.toPublic([row]);
    const isMine = row.organizer_id === viewerId;
    return {
      ...pub,
      description: row.description,
      organizerNickname: row.nickname,
      closeReason: row.eff_reason,
      isMine,
      // 모집중일 때만 오픈카톡 URL 제공. 작성자 관리 화면은 수정을 위해 항상 받는다.
      openChatUrl: row.eff_status === 'OPEN' || (includeUrlAlways && isMine) ? row.open_chat_url : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  detail(id: number, viewerId: number) {
    const row = this.getRow(id);
    const visibleToViewer = row && !row.withdrawn_at && (row.status !== 'CANCELLED' || row.organizer_id === viewerId);
    if (!row || !visibleToViewer) fail(404, 'NOT_FOUND', '모집글을 찾을 수 없어요.');
    return this.full(row, viewerId, false);
  }

  mine(userId: number) {
    const ids = this.db
      .prepare('SELECT id FROM posts WHERE organizer_id = ? ORDER BY meetup_at, id')
      .all(userId) as { id: number }[];
    return ids.map(({ id }) => this.full(this.getRow(id)!, userId, true));
  }

  // ---------- 쓰기 ----------

  validate(body: unknown, mode: 'create' | 'update'): PostInput {
    const b = (body ?? {}) as Record<string, unknown>;
    const errors: Record<string, string> = {};

    const day = b.day;
    if (!isEventDay(day)) errors.day = '10월 2일~4일 중에서 선택해 주세요.';
    const time = typeof b.time === 'string' ? b.time : '';
    const tm = TIME_RE.exec(time);
    if (!tm) errors.time = '모임 시간을 입력해 주세요.';
    else if (Number(tm[2]) % POST_RULES.minuteStep !== 0) errors.time = `${POST_RULES.minuteStep}분 단위로 입력해 주세요.`;
    else if (Number(tm[1]) < POST_RULES.hourStart || Number(tm[1]) >= POST_RULES.hourEnd) errors.time = HOURS_MESSAGE;
    let meetupAt = '';
    if (!errors.day && !errors.time) {
      meetupAt = kstToUtcIso(day as string, time);
      if (meetupAt <= nowIso()) errors.time = '이미 지난 시간은 선택할 수 없어요.';
    }

    const targetPeople = Number(b.targetPeople);
    if (!Number.isInteger(targetPeople) || targetPeople < POST_RULES.peopleMin || targetPeople > POST_RULES.peopleMax) {
      errors.targetPeople = `희망 인원은 ${POST_RULES.peopleMin}~${POST_RULES.peopleMax}명으로 정해 주세요.`;
    }

    const title = str(b.title);
    if (!title) errors.title = '제목을 입력해 주세요.';
    else if ([...title].length > POST_RULES.titleMax) errors.title = `제목은 ${POST_RULES.titleMax}자 이내로 입력해 주세요.`;

    const description = str(b.description, true);
    if (!description) errors.description = '내용을 입력해 주세요.';
    else if ([...description].length > POST_RULES.descriptionMax) {
      errors.description = `내용은 ${POST_RULES.descriptionMax}자 이내로 입력해 주세요.`;
    }

    const openChatUrl = str(b.openChatUrl);
    if (!openChatUrl) errors.openChatUrl = '오픈카톡 링크를 입력해 주세요.';
    else if (!OPEN_CHAT_RE.test(openChatUrl)) errors.openChatUrl = 'https://open.kakao.com/o/ 로 시작하는 오픈카톡 링크를 입력해 주세요.';

    const menuIds = Array.isArray(b.menuIds) ? [...new Set(b.menuIds.map(Number))] : [];
    if (menuIds.some((n) => !Number.isInteger(n) || n <= 0)) errors.menus = '메뉴 선택을 다시 확인해 주세요.';

    const customMenus: CustomMenuInput[] = [];
    const rawCustom = Array.isArray(b.customMenus) ? b.customMenus : [];
    if (rawCustom.length > POST_RULES.customMenusMax) errors.menus = `기타 메뉴는 ${POST_RULES.customMenusMax}개까지 추가할 수 있어요.`;
    for (const c of rawCustom.slice(0, POST_RULES.customMenusMax)) {
      const o = (c ?? {}) as Record<string, unknown>;
      const vendorName = str(o.vendorName);
      const name = str(o.name);
      const price = o.price === null || o.price === undefined || o.price === '' ? null : Number(o.price);
      const uploadId = typeof o.uploadId === 'string' && o.uploadId ? o.uploadId : null;
      if (!vendorName || !name || [...vendorName].length > 30 || [...name].length > 30) {
        errors.menus = '기타 메뉴의 업체명과 메뉴명을 30자 이내로 입력해 주세요.';
      } else if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1_000_000)) {
        errors.menus = '기타 메뉴 가격을 숫자로 입력해 주세요.';
      } else {
        customMenus.push({ vendorName, name, price, uploadId });
      }
    }
    const total = menuIds.length + customMenus.length;
    if (!errors.menus && total === 0) errors.menus = '메뉴를 하나 이상 선택해 주세요.';
    if (!errors.menus && total > POST_RULES.menusMax) errors.menus = `메뉴는 ${POST_RULES.menusMax}개까지 선택할 수 있어요.`;

    if (mode === 'create' && (b.agreedGuideline !== true || b.guidelineVersion !== GUIDELINE_VERSION)) {
      errors.agreement = '안내 내용을 확인해 주세요.';
    }

    if (Object.keys(errors).length) fail(400, 'VALIDATION', '입력 내용을 확인해 주세요.', { errors });
    return {
      day: day as string, time, meetupAt, targetPeople, title: title!, description: description!,
      openChatUrl: openChatUrl!, menuIds, customMenus,
    };
  }

  /** 선택 메뉴 id 검증: 공식(활성) 메뉴 또는 본인이 만든 기타 메뉴만 */
  private checkMenuIds(menuIds: number[], userId: number) {
    if (!menuIds.length) return;
    const rows = this.db
      .prepare(`SELECT id FROM menus WHERE id IN (${menuIds.map(() => '?').join(',')})
                AND ((is_official = 1 AND active = 1) OR created_by = ?)`)
      .all(...menuIds, userId) as { id: number }[];
    if (rows.length !== menuIds.length) {
      fail(400, 'VALIDATION', '입력 내용을 확인해 주세요.', { errors: { menus: '선택할 수 없는 메뉴가 있어요.' } });
    }
  }

  private createCustomMenus(customMenus: CustomMenuInput[], userId: number): number[] {
    const now = nowIso();
    return customMenus.map((c) => {
      const official = this.db
        .prepare('SELECT id FROM vendors WHERE is_official = 1 AND name = ?')
        .get(c.vendorName) as { id: number } | undefined;
      let vendorId = official?.id;
      if (!vendorId) {
        const custom = this.db
          .prepare('SELECT id FROM vendors WHERE is_official = 0 AND name = ?')
          .get(c.vendorName) as { id: number } | undefined;
        vendorId =
          custom?.id ??
          Number(
            this.db
              .prepare('INSERT INTO vendors (name, is_official, sort_order, created_by, created_at) VALUES (?, 0, 1000, ?, ?)')
              .run(c.vendorName, userId, now).lastInsertRowid,
          );
      }
      let image: string | null = null;
      if (c.uploadId) {
        const up = this.db
          .prepare('SELECT path FROM uploads WHERE id = ? AND owner_id = ?')
          .get(c.uploadId, userId) as { path: string } | undefined;
        if (!up) fail(400, 'VALIDATION', '입력 내용을 확인해 주세요.', { errors: { menus: '업로드한 사진을 찾을 수 없어요.' } });
        image = up.path;
      }
      return Number(
        this.db
          .prepare(`INSERT INTO menus (vendor_id, name, price, menu_image, is_official, active, created_by, sort_order, created_at)
                    VALUES (?, ?, ?, ?, 0, 1, ?, 1000, ?)`)
          .run(vendorId, c.name, c.price, image, userId, now).lastInsertRowid,
      );
    });
  }

  private setMenus(postId: number, menuIds: number[]) {
    this.db.prepare('DELETE FROM post_menus WHERE post_id = ?').run(postId);
    const ins = this.db.prepare('INSERT INTO post_menus (post_id, menu_id) VALUES (?, ?)');
    for (const m of menuIds) ins.run(postId, m);
  }

  create(userId: number, body: unknown) {
    const input = this.validate(body, 'create');
    const now = nowIso();
    const id = this.db.transaction(() => {
      const open = this.db
        .prepare(`SELECT COUNT(*) AS n FROM posts WHERE organizer_id = ? AND status = 'OPEN' AND meetup_at > ?`)
        .get(userId, now) as { n: number };
      if (open.n >= POST_RULES.openPostsPerUser) {
        fail(429, 'TOO_MANY_OPEN_POSTS', `모집중인 글은 한 번에 ${POST_RULES.openPostsPerUser}개까지 올릴 수 있어요.`);
      }
      this.checkMenuIds(input.menuIds, userId);
      const allMenus = [...input.menuIds, ...this.createCustomMenus(input.customMenus, userId)];
      const postId = Number(
        this.db
          .prepare(`INSERT INTO posts (organizer_id, title, description, event_day, meetup_at, target_people, open_chat_url,
                      status, guideline_version, guideline_agreed_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`)
          .run(userId, input.title, input.description, input.day, input.meetupAt, input.targetPeople,
            input.openChatUrl, GUIDELINE_VERSION, now, now, now).lastInsertRowid,
      );
      this.setMenus(postId, allMenus);
      return postId;
    })();
    return this.detail(id, userId);
  }

  private ownedRow(id: number, userId: number) {
    const row = this.getRow(id);
    if (!row || row.withdrawn_at) fail(404, 'NOT_FOUND', '모집글을 찾을 수 없어요.');
    if (row.organizer_id !== userId) fail(403, 'NOT_OWNER', '작성자만 변경할 수 있어요.');
    return row;
  }

  update(id: number, userId: number, body: unknown) {
    const row = this.ownedRow(id, userId);
    if (row.eff_status !== 'OPEN') fail(409, 'NOT_OPEN', '모집중인 글만 수정할 수 있어요.');
    const input = this.validate(body, 'update');
    const now = nowIso();
    this.db.transaction(() => {
      this.checkMenuIds(input.menuIds, userId);
      const allMenus = [...input.menuIds, ...this.createCustomMenus(input.customMenus, userId)];
      this.db
        .prepare(`UPDATE posts SET title=?, description=?, event_day=?, meetup_at=?, target_people=?, open_chat_url=?, updated_at=?
                  WHERE id=? AND status='OPEN'`)
        .run(input.title, input.description, input.day, input.meetupAt, input.targetPeople, input.openChatUrl, now, id);
      this.setMenus(id, allMenus);
    })();
    return this.full(this.getRow(id)!, userId, true);
  }

  close(id: number, userId: number) {
    const row = this.ownedRow(id, userId);
    if (row.eff_status !== 'OPEN') fail(409, 'NOT_OPEN', '이미 모집이 끝난 글이에요.');
    const now = nowIso();
    this.db
      .prepare(`UPDATE posts SET status='CLOSED', close_reason='MANUAL', closed_at=?, updated_at=? WHERE id=? AND status='OPEN'`)
      .run(now, now, id);
    return this.full(this.getRow(id)!, userId, true);
  }

  cancel(id: number, userId: number) {
    const row = this.ownedRow(id, userId);
    if (row.status === 'CANCELLED') fail(409, 'ALREADY_CANCELLED', '이미 취소한 글이에요.');
    const now = nowIso();
    this.db.prepare(`UPDATE posts SET status='CANCELLED', cancelled_at=?, updated_at=? WHERE id=?`).run(now, now, id);
    return this.full(this.getRow(id)!, userId, true);
  }
}

function str(v: unknown, multiline = false): string | null {
  if (typeof v !== 'string') return null;
  const s = multiline ? v.replace(/\r\n/g, '\n').trim() : v.replace(/\s+/g, ' ').trim();
  return s || null;
}

function toMenuRef(r: {
  id: number; name: string; price: number | null; is_official: number; menu_image: string | null;
  vendor_id: number; vendor_name: string; vendor_image: string | null;
}): MenuRef {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    isOfficial: !!r.is_official,
    image: r.menu_image ?? (r.is_official ? r.vendor_image : null),
    imageKind: r.menu_image ? 'menu' : r.is_official && r.vendor_image ? 'vendor' : null,
  };
}
