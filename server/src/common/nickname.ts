const ADJECTIVES = ['따끈한', '바삭한', '든든한', '말랑한', '고소한', '새콤한', '달콤한', '쫄깃한', '시원한', '포슬한', '노릇한', '촉촉한'];
const NOUNS = ['어묵', '밀면', '국밥', '소금빵', '츄러스', '만두', '부추전', '떡볶이', '타코야끼', '브리또', '소시지', '컵밥'];

export const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/;

export function randomNickname(): string {
  const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return pick(ADJECTIVES) + pick(NOUNS);
}

/** base가 이미 있으면 2, 3, ... 접미사를 붙여 비어 있는 닉네임을 찾는다(12자 제한 유지). */
export function withFreeSuffix(base: string, taken: (n: string) => boolean): string {
  if (!taken(base)) return base;
  for (let i = 2; i < 10000; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 12 - suffix.length) + suffix;
    if (!taken(candidate)) return candidate;
  }
  throw new Error('닉네임 후보를 찾지 못함');
}
