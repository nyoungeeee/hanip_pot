const WD = ['일', '월', '화', '수', '목', '금', '토'];

export function won(price: number | null | undefined): string {
  return price == null ? '' : `${price.toLocaleString('ko-KR')}원`;
}

/** '2026-10-02' → '10.02 금' */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} ${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

/** '2026-10-02' → '10월 2일 (금)' */
export function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일 (${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

export function menuLine(menus: { vendorName: string; name: string }[]): string {
  if (!menus.length) return '';
  const [first, ...rest] = menus;
  // "[업체명] 메뉴명". 업체명과 메뉴명이 같으면(장호밀면) 메뉴명만
  const head = first.vendorName === first.name ? first.name : `[${first.vendorName}] ${first.name}`;
  return `${head}${rest.length ? ` 외 ${rest.length}` : ''}`;
}

export function kstNowIso(): string {
  return new Date().toISOString();
}

export function toMeetupIso(day: string, time: string): string {
  const d = new Date(`${day}T${time}:00+09:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

// ---- 메뉴 검색: 공백·대소문자 무시, 한글 초성(ㄷㅈㄱㅂ → 돼지국밥)도 매칭 ----
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const initials = (s: string) =>
  [...s].map((c) => {
    const code = c.charCodeAt(0) - 0xac00;
    return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c;
  }).join('');

export function matchesQuery(query: string, text: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const t = norm(text);
  if (t.includes(q)) return true;
  // 초성만 입력한 경우
  return /^[ㄱ-ㅎ]+$/.test(q) && initials(t).includes(q);
}

/** 업체명이 맞으면 그 업체 메뉴 전부, 아니면 메뉴명이 맞는 메뉴만 남긴다. */
export function filterVendors<M extends { name: string }, V extends { name: string; menus: M[] }>(vendors: V[], query: string): V[] {
  if (!norm(query)) return vendors;
  return vendors
    .map((v) => (matchesQuery(query, v.name) ? v : { ...v, menus: v.menus.filter((m) => matchesQuery(query, m.name)) }))
    .filter((v) => v.menus.length > 0);
}

/** 메뉴 아래 보조 줄: "업체 · 가격". 업체명이 메뉴명과 같으면(장호밀면/장호밀면) 업체는 생략. */
export function menuSubLine(m: { vendorName: string; name: string; price: number | null }): string {
  return [m.vendorName === m.name ? '' : m.vendorName, won(m.price)].filter(Boolean).join(' · ');
}

/**
 * 모임 시간 기본값: 지금 이후 가장 가까운 10분 단위 시각(운영 시간 안).
 * 미래 날짜면 운영 시작 시각, 그날 운영 시간이 끝났으면 ''.
 */
export function nearestSlot(day: string, rules: { minuteStep: number; hourStart: number; hourEnd: number }, now = new Date()): string {
  const start = rules.hourStart * 60;
  const end = rules.hourEnd * 60; // 이 시각은 선택 불가
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const today = kst.toISOString().slice(0, 10);
  if (day < today) return '';
  let min = start;
  if (day === today) {
    const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
    min = Math.max(start, (Math.floor(nowMin / rules.minuteStep) + 1) * rules.minuteStep);
  }
  if (!Number.isFinite(min) || min >= end) return '';
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
