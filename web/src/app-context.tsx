import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { api, ApiError, DaysResponse, loginUrl, Me } from './api';
import { COPY } from './copy';
import { IconLock } from './components/Icons';
import { Sheet } from './components/ui';

interface Ctx {
  user: Me | null;
  userLoaded: boolean;
  refreshUser: () => Promise<Me | null>;
  setUser: (u: Me | null) => void;
  /** 로그인 필요 기능 진입 시 A1 바텀시트를 띄운다. */
  requireLogin: (returnTo?: string) => void;
  /** API 오류가 세션 만료(401)라면 로그인 시트를 띄우고 true */
  handleAuthError: (e: unknown, returnTo?: string) => boolean;
  toast: (msg: string) => void;
  meta: DaysResponse | null;
}

const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

const DAY_KEY = 'hp_day';
// 서버가 규칙 값을 빠뜨려도(구버전 서버 등) 화면이 깨지지 않도록 쓰는 기본값
const RULE_DEFAULTS = { minuteStep: 10, hourStart: 10, hourEnd: 24 };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [meta, setMeta] = useState<DaysResponse | null>(null);
  const location = useLocation();

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api.me();
      setUser(user);
      return user;
    } catch {
      return null;
    } finally {
      setUserLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const load = () =>
      api.days()
        .then((m) => setMeta({ ...m, rules: { ...RULE_DEFAULTS, ...m.rules } }))
        .catch(() => setTimeout(load, 3000));
    load();
  }, [refreshUser]);

  const requireLogin = useCallback(
    (returnTo?: string) => setLoginFor(returnTo ?? location.pathname + location.search),
    [location],
  );

  const handleAuthError = useCallback(
    (e: unknown, returnTo?: string) => {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        requireLogin(returnTo);
        return true;
      }
      return false;
    },
    [requireLogin],
  );

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2400);
  }, []);

  const value = useMemo(
    () => ({ user, userLoaded, refreshUser, setUser, requireLogin, handleAuthError, toast, meta }),
    [user, userLoaded, refreshUser, requireLogin, handleAuthError, toast, meta],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      {loginFor !== null && <LoginSheet returnTo={loginFor} onClose={() => setLoginFor(null)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}

export function LoginSheet({ returnTo, onClose }: { returnTo: string; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="로그인 안내">
      <div className="icon-circle"><IconLock /></div>
      <h2 className="center" style={{ fontSize: 18 }}>{COPY.loginTitle}</h2>
      <p className="center muted" style={{ fontSize: 14, margin: '8px 0 20px' }}>{COPY.loginBody}</p>
      <a className="btn kakao" href={loginUrl(returnTo)}>
        <KakaoSymbol /> {COPY.loginCta}
      </a>
    </Sheet>
  );
}

function KakaoSymbol() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#191600" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.4 0 .9.1 1.3.1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
    </svg>
  );
}

/** 메뉴별/시간별이 같은 선택 날짜를 공유(URL ?day= 우선, 없으면 세션 기억값, 없으면 기본값) */
export function useSelectedDay(): [string | null, (d: string) => void] {
  const { meta } = useApp();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('day');
  let remembered: string | null = null;
  try {
    remembered = sessionStorage.getItem(DAY_KEY);
  } catch {}
  const valid = (d: string | null) => !!d && !!meta?.days.some((x) => x.date === d);
  const day = meta ? (valid(fromUrl) ? fromUrl : valid(remembered) ? remembered : meta.defaultDay) : null;
  const setDay = (d: string) => {
    try {
      sessionStorage.setItem(DAY_KEY, d);
    } catch {}
    setParams((p) => {
      p.set('day', d);
      return p;
    }, { replace: true });
  };
  return [day, setDay];
}

const OPEN_ONLY_KEY = 'hp_open_only';

/** "모집중인 팟만 보기". 메뉴별·시간별 화면이 같은 값을 쓰도록 탭 세션 동안 기억한다. */
export function useOpenOnly(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return sessionStorage.getItem(OPEN_ONLY_KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setValue(v);
    try {
      sessionStorage.setItem(OPEN_ONLY_KEY, v ? '1' : '0');
    } catch {}
  };
  return [value, set];
}
