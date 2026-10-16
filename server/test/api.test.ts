// 요구사항 6장 "최소 검증 시나리오"를 실제 서버 프로세스(AUTH_MOCK)로 확인한다.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hanippot-test-'));
let server: ChildProcess;

const DAY = '2026-10-18';
const GV = '2026-09-30';

function cookieFrom(res: Response, name: string): string | null {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    if (k === name && v) return decodeURIComponent(v);
  }
  return null;
}

async function login(kid: string): Promise<{ cookie: string | null; location: string }> {
  const r1 = await fetch(`${BASE}/api/auth/kakao/login?returnTo=/new`, { redirect: 'manual' });
  const oauth = cookieFrom(r1, 'hp_oauth')!;
  const state = new URL(r1.headers.get('location')!, BASE).searchParams.get('state')!;
  const r2 = await fetch(`${BASE}/api/auth/mock/go?state=${state}&kid=${kid}`, { redirect: 'manual' });
  const r3 = await fetch(new URL(r2.headers.get('location')!, BASE), {
    redirect: 'manual',
    headers: { cookie: `hp_oauth=${encodeURIComponent(oauth)}` },
  });
  const sid = cookieFrom(r3, 'hp_sid');
  return { cookie: sid ? `hp_sid=${sid}` : null, location: r3.headers.get('location')! };
}

async function call(method: string, p: string, cookie?: string | null, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET' && !('x-hanippot' in extraHeaders)) headers['X-Hanippot'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, text };
}

let menuIds: Record<string, number> = {};
function postBody(over: Record<string, unknown> = {}) {
  return {
    day: DAY, time: '13:00', targetPeople: 4, title: '같이 먹어요', description: '나눠 먹어요',
    openChatUrl: 'https://open.kakao.com/o/gAbcdef1', menuIds: [menuIds['떡볶이']], customMenus: [],
    agreedGuideline: true, guidelineVersion: GV, ...over,
  };
}

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'main.js')], {
    env: { ...process.env, PORT: String(PORT), AUTH_MOCK: '1', DATA_DIR: tmp, UPLOAD_DIR: path.join(tmp, 'up'), WEB_DIST: path.join(tmp, 'noweb'), PUBLIC_URL: BASE, NODE_ENV: 'test', ADMIN_KAKAO_IDS: 'mock-900', SEED_DIR: path.join(__dirname, '..', '..', 'seed') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const { json } = await call('GET', '/menus');
  for (const v of json.vendors) for (const m of v.menus) menuIds[m.name] = m.id;
});

after(() => {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('인증·접근', () => {
  test('비로그인: 목록은 보이고 상세·등록·내정보는 401', async () => {
    assert.equal((await call('GET', `/vendors?day=${DAY}`)).status, 200);
    assert.equal((await call('GET', `/posts/timeline?day=${DAY}`)).status, 200);
    assert.equal((await call('GET', '/posts/1')).status, 401);
    assert.equal((await call('POST', '/posts', null, postBody())).status, 401);
    assert.equal((await call('GET', '/me/posts')).status, 401);
    assert.deepEqual((await call('GET', '/me')).json, { user: null });
  });

  test('신규 계정은 닉네임 화면으로, 닉네임 중복은 접미사 제안', async () => {
    const a = await login('1');
    assert.ok(a.cookie);
    assert.match(a.location, /^\/welcome\?returnTo=%2Fnew/);
    assert.equal((await call('PATCH', '/me', a.cookie, { nickname: '어묵러버' })).status, 200);
    const b = await login('2');
    const dup = await call('PATCH', '/me', b.cookie, { nickname: '어묵러버' });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.suggestion, '어묵러버2');
    // 두 번째 로그인부터는 returnTo로 바로
    const again = await login('1');
    assert.equal(again.location, '/new');
  });

  test('쓰기 요청은 CSRF 헤더 없으면 거부', async () => {
    const a = await login('1');
    const r = await call('POST', '/posts', a.cookie, postBody(), { 'x-hanippot': '' });
    assert.equal(r.status, 403);
    const r2 = await call('POST', '/posts', a.cookie, postBody(), { 'X-Hanippot': '1', Origin: 'https://evil.example' });
    assert.equal(r2.status, 403);
  });
});

describe('모집글', () => {
  let owner: string;
  let other: string;
  let multiId: number;

  before(async () => {
    owner = (await login('1')).cookie!;
    other = (await login('2')).cookie!;
  });

  test('입력 검증: 과거 시각·잘못된 URL·메뉴 초과·안내 미동의', async () => {
    const r = await call('POST', '/posts', owner, postBody({
      day: '2026-10-05', openChatUrl: 'https://evil.example/o/x', menuIds: [], agreedGuideline: false,
    }));
    assert.equal(r.status, 400);
    assert.ok(r.json.errors.day && r.json.errors.openChatUrl && r.json.errors.menus && r.json.errors.agreement);
    const six = Object.values(menuIds).slice(0, 6);
    assert.equal((await call('POST', '/posts', owner, postBody({ menuIds: six }))).json.errors.menus, '메뉴는 5개까지 선택할 수 있어요.');
    assert.ok((await call('POST', '/posts', owner, postBody({ time: '13:05' }))).json.errors.time);
    // 행사 운영 시간(10:00~24:00) 밖은 거부
    assert.ok((await call('POST', '/posts', owner, postBody({ time: '09:50' }))).json.errors.time);
    assert.ok((await call('POST', '/posts', owner, postBody({ time: '00:00' }))).json.errors.time);
    assert.equal((await call('POST', '/posts', owner, postBody({ title: '마지막 시각', time: '23:50' }))).status, 201);
  });

  test('두 업체 메뉴를 고른 글은 각 메뉴 아래에 모두, 타임라인에는 한 번만', async () => {
    const r = await call('POST', '/posts', owner, postBody({ menuIds: [menuIds['떡볶이'], menuIds['타코야끼']], title: '떡볶이+타코야끼' }));
    assert.equal(r.status, 201);
    multiId = r.json.post.id;
    const a = await call('GET', `/posts?day=${DAY}&menuId=${menuIds['떡볶이']}`);
    const b = await call('GET', `/posts?day=${DAY}&menuId=${menuIds['타코야끼']}`);
    assert.ok(a.json.posts.some((p: { id: number }) => p.id === multiId));
    assert.ok(b.json.posts.some((p: { id: number }) => p.id === multiId));
    const tl = await call('GET', `/posts/timeline?day=${DAY}`);
    const ids = tl.json.groups.flatMap((g: { posts: { id: number }[] }) => g.posts.map((p) => p.id));
    assert.equal(ids.filter((id: number) => id === multiId).length, 1);
    const v = await call('GET', `/vendors?day=${DAY}`);
    const menu = v.json.vendors.flatMap((x: { menus: unknown[] }) => x.menus).find((m: { id: number }) => m.id === menuIds['타코야끼']);
    assert.equal(menu.openCount, 1);
  });

  test('공개 응답에 닉네임·오픈카톡 URL·설명·참여 인원 없음', async () => {
    for (const p of [`/posts?day=${DAY}`, `/posts/timeline?day=${DAY}`, `/vendors?day=${DAY}`]) {
      const { text } = await call('GET', p);
      assert.ok(!text.includes('open.kakao.com'), p);
      assert.ok(!text.includes('어묵러버'), p);
      assert.ok(!text.includes('나눠 먹어요'), p);
      assert.ok(!/participant|joined|currentPeople/i.test(text), p);
    }
    const d = await call('GET', `/posts/${multiId}`, other);
    assert.equal(d.json.post.organizerNickname, '어묵러버');
    assert.equal(d.json.post.openChatUrl, 'https://open.kakao.com/o/gAbcdef1');
  });

  test('타인은 수정·종료·취소 불가', async () => {
    assert.equal((await call('PATCH', `/posts/${multiId}`, other, postBody())).status, 403);
    assert.equal((await call('POST', `/posts/${multiId}/close`, other)).status, 403);
    assert.equal((await call('POST', `/posts/${multiId}/cancel`, other)).status, 403);
  });

  test('수동 종료와 시간 경과 종료가 같은 결과(상태·정렬·URL 숨김)', async () => {
    const manual = (await call('POST', '/posts', owner, postBody({ title: '수동', time: '14:00' }))).json.post.id;
    const expired = (await call('POST', '/posts', owner, postBody({ title: '경과', time: '14:10' }))).json.post.id;
    const open = (await call('POST', '/posts', owner, postBody({ title: '진행', time: '15:00' }))).json.post.id;
    assert.equal((await call('POST', `/posts/${manual}/close`, owner)).json.post.status, 'CLOSED');
    // 모임 시각을 과거로 돌려 시간 경과 상황을 만든다
    const db = new Database(path.join(tmp, 'hanippot.sqlite'));
    db.prepare(`UPDATE posts SET meetup_at='2020-01-01T00:00:00.000Z' WHERE id=?`).run(expired);

    for (const id of [manual, expired]) {
      const d = (await call('GET', `/posts/${id}`, other)).json.post;
      assert.equal(d.status, 'CLOSED');
      assert.equal(d.openChatUrl, null);
    }
    assert.equal((await call('GET', `/posts/${expired}`, other)).json.post.closeReason, 'EXPIRED');
    const list = (await call('GET', `/posts?day=${DAY}&menuId=${menuIds['떡볶이']}`)).json.posts as { id: number; status: string }[];
    const firstClosed = list.findIndex((p) => p.status !== 'OPEN');
    assert.ok(list.slice(firstClosed).every((p) => p.status !== 'OPEN'), '모집중이 먼저');
    assert.ok(list.findIndex((p) => p.id === open) < firstClosed);
    // 경과 글은 수정·종료 불가
    assert.equal((await call('PATCH', `/posts/${expired}`, owner, postBody())).status, 409);
    const stored = db.prepare('SELECT status FROM posts WHERE id=?').get(expired) as { status: string };
    db.close();
    assert.ok(['OPEN', 'CLOSED'].includes(stored.status));
  });

  test('취소 글은 공개 목록에서 사라지고 작성자 내 글에는 남는다', async () => {
    const id = (await call('POST', '/posts', owner, postBody({ title: '취소할글', time: '16:00' }))).json.post.id;
    assert.equal((await call('POST', `/posts/${id}/cancel`, owner)).status, 200);
    const tl = (await call('GET', `/posts/timeline?day=${DAY}`)).text;
    assert.ok(!tl.includes('취소할글'));
    assert.equal((await call('GET', `/posts/${id}`, other)).status, 404);
    const mine = (await call('GET', '/me/posts', owner)).json.posts as { id: number; status: string }[];
    assert.equal(mine.find((p) => p.id === id)?.status, 'CANCELLED');
  });

  test('기타 메뉴: 공식 업체명이면 그 업체 아래, 아니면 새 업체로 노출', async () => {
    const r = await call('POST', '/posts', owner, postBody({
      menuIds: [], time: '17:00',
      customMenus: [{ vendorName: '베리분식', name: '떡튀김', price: 3000 }, { vendorName: '새로운포차', name: '포차오뎅꼬치', price: null }],
    }));
    assert.equal(r.status, 201);
    const vendors = (await call('GET', `/vendors?day=${DAY}`)).json.vendors as { name: string; isOfficial: boolean; menus: { name: string; image: string | null }[] }[];
    assert.ok(vendors.find((v) => v.name === '베리분식')!.menus.some((m) => m.name === '떡튀김' && m.image === null));
    assert.equal(vendors.find((v) => v.name === '새로운포차')?.isOfficial, false);
    // 다른 날에는 기타 메뉴가 보이지 않는다
    const other = (await call('GET', '/vendors?day=2026-10-17')).text;
    assert.ok(!other.includes('포차오뎅꼬치'));
  });

  test('탈퇴: 글 숨김, 세션 무효, 재로그인은 새 계정', async () => {
    const w = await login('777');
    await call('PATCH', '/me', w.cookie, { nickname: '떠날사람' });
    const id = (await call('POST', '/posts', w.cookie, postBody({ title: '탈퇴자글', time: '18:00' }))).json.post.id;
    assert.equal((await call('DELETE', '/me', w.cookie)).status, 200);
    assert.deepEqual((await call('GET', '/me', w.cookie)).json, { user: null });
    assert.ok(!(await call('GET', `/posts/timeline?day=${DAY}`)).text.includes('탈퇴자글'));
    assert.equal((await call('GET', `/posts/${id}`, owner)).status, 404);
    const again = await login('777');
    assert.match(again.location, /^\/welcome/);
    // 닉네임이 해제되어 다시 쓸 수 있다
    assert.equal((await call('PATCH', '/me', again.cookie, { nickname: '떠날사람' })).status, 200);
  });
});

describe('메뉴 후기', () => {
  test('작성·공개·한 메뉴 한 개·입력 검사', async () => {
    const menuId = menuIds['타코야끼'];
    const a = await login('801');
    await call('PATCH', '/me', a.cookie, { nickname: '후기러' });
    // 읽기는 로그인 없이, 쓰기는 로그인 필요
    assert.equal((await call('GET', `/menus/${menuId}`)).status, 200);
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, null, { body: '맛있어요 추천', verdict: 'GOOD' })).status, 401);
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '짧', verdict: 'GOOD' })).status, 400);
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '맛있어요 추천', verdict: 'SO' })).status, 400);
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '여기로 오세요 open.kakao.com/o/abc', verdict: 'GOOD' })).status, 400);
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '연락 010-1234-5678 주세요', verdict: 'GOOD' })).status, 400);
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '겉바속촉 맛있어요', verdict: 'GOOD' })).status, 201);
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '한 번 더 쓰기', verdict: 'MEH' })).status, 409);

    const d = (await call('GET', `/menus/${menuId}`)).json;
    assert.deepEqual(d.summary, { count: 1, good: 1, meh: 0 });
    assert.equal(d.reviews[0].nickname, '후기러');
    assert.equal(d.reviews[0].hidden, null);
    const vendors = (await call('GET', `/vendors?day=${DAY}`)).json.vendors as { menus: { id: number; reviewCount: number; goodCount: number }[] }[];
    const m = vendors.flatMap((v) => v.menus).find((x) => x.id === menuId)!;
    assert.equal(m.reviewCount, 1);
    assert.equal(m.goodCount, 1);
    assert.equal((await call('GET', `/menus/${menuId}`, a.cookie)).json.myReview.hidden, false);
    // 모집글 상세의 메뉴에도 후기 수가 붙는다
    const pid = (await call('POST', '/posts', a.cookie, postBody({ menuIds: [menuId], title: '후기수확인', time: '19:00' }))).json.post.id;
    const pm = (await call('GET', `/posts/${pid}`, a.cookie)).json.post.menus[0];
    assert.equal(pm.reviewCount, 1);
    assert.equal(pm.goodCount, 1);
  });

  test('운영자 숨김: 공개에서 빠지고 작성자에겐 숨김 상태로 남고 복구 가능', async () => {
    const menuId = menuIds['소떡소떡'];
    const a = await login('802');
    await call('PATCH', '/me', a.cookie, { nickname: '광고계정' });
    const id = (await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '우리 가게도 와주세요', verdict: 'GOOD' })).json.review.id;
    const admin = await login('900');
    await call('PATCH', '/me', admin.cookie, { nickname: '운영자' });
    assert.equal((await call('GET', '/me', admin.cookie)).json.user.isAdmin, true);
    assert.equal((await call('GET', '/me', a.cookie)).json.user.isAdmin, false);

    // 일반 회원은 숨길 수 없고, 이유가 없으면 거부
    assert.equal((await call('POST', `/admin/reviews/${id}/hide`, a.cookie, { reason: 'AD' })).status, 403);
    assert.equal((await call('POST', `/admin/reviews/${id}/hide`, admin.cookie, { reason: 'WHY' })).status, 400);
    assert.equal((await call('POST', `/admin/reviews/${id}/hide`, admin.cookie, { reason: 'AD' })).status, 200);

    const pub = (await call('GET', `/menus/${menuId}`)).json;
    assert.equal(pub.summary.count, 0);
    assert.equal(pub.reviews.length, 0);
    const asAdmin = (await call('GET', `/menus/${menuId}`, admin.cookie)).json;
    assert.deepEqual(asAdmin.reviews[0].hidden, { reason: 'AD' });
    assert.equal(asAdmin.summary.count, 0);
    // 작성자: 사유 없이 상태만
    const mine = (await call('GET', '/me/reviews', a.cookie)).json.reviews;
    assert.equal(mine[0].status, 'HIDDEN');
    assert.ok(!('reason' in mine[0]));

    assert.equal((await call('POST', `/admin/reviews/${id}/unhide`, admin.cookie)).status, 200);
    assert.equal((await call('GET', `/menus/${menuId}`)).json.summary.count, 1);
  });

  test('삭제: 본인만, 지우면 다시 쓸 수 있고 탈퇴하면 숨김', async () => {
    const menuId = menuIds['순대'];
    const a = await login('803');
    await call('PATCH', '/me', a.cookie, { nickname: '순대러' });
    const b = await login('804');
    await call('PATCH', '/me', b.cookie, { nickname: '남의글' });
    const id = (await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '찰순대 쫄깃해요', verdict: 'GOOD' })).json.review.id;
    assert.equal((await call('DELETE', `/me/reviews/${id}`, b.cookie)).status, 404);
    assert.equal((await call('DELETE', `/me/reviews/${id}`, a.cookie)).status, 200);
    assert.equal((await call('GET', '/me/reviews', a.cookie)).json.reviews.length, 0);
    assert.equal((await call('GET', `/menus/${menuId}`)).json.summary.count, 0);
    // 지운 뒤에는 다시 쓸 수 있다
    assert.equal((await call('POST', `/menus/${menuId}/reviews`, a.cookie, { body: '다시 먹어도 맛있음', verdict: 'GOOD' })).status, 201);
    assert.equal((await call('GET', `/menus/${menuId}`)).json.summary.count, 1);
    assert.equal((await call('DELETE', '/me', a.cookie)).status, 200);
    assert.equal((await call('GET', `/menus/${menuId}`)).json.summary.count, 0);
  });
});
