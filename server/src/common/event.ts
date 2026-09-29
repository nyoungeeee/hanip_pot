// 행사 기간과 시간 변환. 서울은 서머타임이 없어 +09:00 고정으로 계산한다.
export const EVENT_DAYS = ['2026-10-02', '2026-10-03', '2026-10-04'] as const;
export type EventDay = (typeof EVENT_DAYS)[number];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function isEventDay(v: unknown): v is EventDay {
  return typeof v === 'string' && (EVENT_DAYS as readonly string[]).includes(v);
}

export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} ${wd}`;
}

/** KST 날짜+시각 → UTC ISO 문자열 */
export function kstToUtcIso(day: string, time: string): string {
  return new Date(`${day}T${time}:00+09:00`).toISOString();
}

/** UTC ISO → { day: 'YYYY-MM-DD', time: 'HH:MM' } (KST) */
export function utcIsoToKst(iso: string): { day: string; time: string } {
  const k = new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString();
  return { day: k.slice(0, 10), time: k.slice(11, 16) };
}

export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

// 입력 정책(요구사항 9-5 미확정 → 초기값으로 정함)
export const POST_RULES = {
  titleMax: 40,
  descriptionMax: 500,
  peopleMin: 2,
  peopleMax: 10,
  menusMax: 5,
  customMenusMax: 3,
  minuteStep: 10,
  openPostsPerUser: 10,
} as const;

// 등록 확인 안내 문구 버전. 문구를 바꾸면 올리고 web/src/copy.ts와 함께 맞춘다.
export const GUIDELINE_VERSION = '2026-09-29';
