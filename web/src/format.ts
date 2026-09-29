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
  return `${first.vendorName} · ${first.name}${rest.length ? ` 외 ${rest.length}` : ''}`;
}

export function kstNowIso(): string {
  return new Date().toISOString();
}

export function toMeetupIso(day: string, time: string): string {
  return new Date(`${day}T${time}:00+09:00`).toISOString();
}
