export type PostStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

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
export interface MenuWithCounts extends MenuRef {
  openCount: number;
  closedCount: number;
}
export interface Vendor<M = MenuRef> {
  id: number;
  name: string;
  zone: string | null;
  isOfficial?: boolean;
  image: string | null;
  menus: M[];
}
export interface PostSummary {
  id: number;
  title: string;
  day: string;
  time: string;
  meetupAt: string;
  targetPeople: number;
  status: PostStatus;
  menus: MenuRef[];
}
export interface PostDetail extends PostSummary {
  description: string;
  organizerNickname: string;
  closeReason: 'MANUAL' | 'EXPIRED' | null;
  isMine: boolean;
  openChatUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TimelineGroup {
  time: string;
  meetupAt: string;
  posts: PostSummary[];
}
export interface Me {
  id: number;
  nickname: string;
  nicknameConfirmed: boolean;
}
export interface Rules {
  titleMax: number;
  descriptionMax: number;
  peopleMin: number;
  peopleMax: number;
  menusMax: number;
  customMenusMax: number;
  minuteStep: number;
}
export interface DaysResponse {
  days: { date: string; label: string }[];
  defaultDay: string;
  rules: Rules;
  guidelineVersion: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get fieldErrors(): Record<string, string> {
    return (this.data.errors as Record<string, string>) ?? {};
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  const headers = init.headers as Record<string, string>;
  if (method !== 'GET') headers['X-Hanippot'] = '1';
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'NETWORK', '네트워크 연결을 확인해 주세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data.message === 'string' ? data.message : '잠시 후 다시 시도해 주세요.';
    throw new ApiError(res.status, data.code ?? 'ERROR', msg, data);
  }
  return data as T;
}

export const api = {
  days: () => request<DaysResponse>('GET', '/days'),
  vendors: (day: string) => request<{ vendors: Vendor<MenuWithCounts>[] }>('GET', `/vendors?day=${day}`),
  menus: () => request<{ vendors: Vendor[] }>('GET', '/menus'),
  posts: (day: string, menuId?: number) =>
    request<{ posts: PostSummary[] }>('GET', `/posts?day=${day}${menuId ? `&menuId=${menuId}` : ''}`),
  timeline: (day: string) => request<{ groups: TimelineGroup[] }>('GET', `/posts/timeline?day=${day}`),
  post: (id: number) => request<{ post: PostDetail }>('GET', `/posts/${id}`),
  createPost: (body: unknown) => request<{ post: PostDetail }>('POST', '/posts', body),
  updatePost: (id: number, body: unknown) => request<{ post: PostDetail }>('PATCH', `/posts/${id}`, body),
  closePost: (id: number) => request<{ post: PostDetail }>('POST', `/posts/${id}/close`),
  cancelPost: (id: number) => request<{ post: PostDetail }>('POST', `/posts/${id}/cancel`),
  me: () => request<{ user: Me | null }>('GET', '/me'),
  updateMe: (nickname: string) => request<{ user: Me }>('PATCH', '/me', { nickname }),
  myPosts: () => request<{ posts: PostDetail[] }>('GET', '/me/posts'),
  withdraw: () => request<{ ok: true; kakaoUnlinked: boolean }>('DELETE', '/me'),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ id: string; url: string }>('POST', '/uploads', fd);
  },
};

export function loginUrl(returnTo: string, consent?: 'gender') {
  const p = new URLSearchParams({ returnTo });
  if (consent) p.set('consent', consent);
  return `/api/auth/kakao/login?${p}`;
}
