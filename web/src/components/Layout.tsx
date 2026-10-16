import { useCallback, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useApp } from '../app-context';
import { CONTACT_URL, POPUP_NOTICE } from '../copy';
import { useEscape } from './ui';
import { IconBack, IconChat, IconChevron, IconClock, IconMenu, IconPlus, IconRefresh, IconUser } from './Icons';

/** 오늘 날짜(한국 시간). "오늘 다시 안 보기" 기준 */
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const storage = {
  get: (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } },
  set: (s: Storage, k: string, v: string) => { try { s.setItem(k, v); } catch { /* 저장이 막힌 브라우저는 이번만 닫힌다 */ } },
};

/** 첫 진입 때 한 번 뜨는 공지. 닫으면 이번 방문 동안, "오늘 다시 안 보기"는 오늘 하루 동안 안 뜬다. */
export function NoticeModal() {
  const n = POPUP_NOTICE;
  const seenKey = n ? `notice-seen:${n.id}` : '';
  const hideKey = n ? `notice-hide:${n.id}` : '';
  const [open, setOpen] = useState(() =>
    !!n && storage.get(sessionStorage, seenKey) !== '1' && storage.get(localStorage, hideKey) !== todayKst(),
  );
  const close = useCallback(() => {
    storage.set(sessionStorage, seenKey, '1');
    setOpen(false);
  }, [seenKey]);
  const hideToday = () => {
    storage.set(localStorage, hideKey, todayKst());
    close();
  };
  useEscape(close, open);
  if (!n || !open) return null;
  return (
    <div className="overlay" onClick={close}>
      <div className="dialog notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-title" onClick={(e) => e.stopPropagation()}>
        <img src="/logo-84.png?v=2" alt="" width={44} height={44} className="notice-mark" />
        <h2 id="notice-title">{n.title}</h2>
        <ul>
          {n.lines.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="notice-closing">{n.closing}</p>
        <a className="btn outline small notice-contact" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
          <IconChat size={18} />운영자에게 의견 보내기
        </a>
        <div className="btn-row">
          <button type="button" className="btn ghost small" onClick={hideToday}>오늘 다시 안 보기</button>
          <button type="button" className="btn primary small" onClick={close} autoFocus>닫기</button>
        </div>
      </div>
    </div>
  );
}

/** 시간별·메뉴별 상단 행사 띠. 누르면 이용 안내(포스터)로 간다. */
export function EventStrip() {
  return (
    <Link to="/guide" className="event-strip">
      <img src="/inmufe/truck.webp" alt="" width={44} height={44} />
      <div>
        <strong>2026 경기인디뮤직페스티벌 푸드트럭</strong>
        <small>10.17 토 – 10.18 일 · 수원 서호 잔디광장</small>
      </div>
      <span className="go"><IconChevron size={18} /></span>
    </Link>
  );
}

/** 메인 안내: 푸드트럭 메뉴가 아니어도(배달·주변 식당·밥친구) 기타 메뉴로 모집글을 올릴 수 있다. */
export function OtherMenuHint() {
  const { user, requireLogin } = useApp();
  const navigate = useNavigate();
  const go = (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) navigate('/new');
    else requireLogin('/new');
  };
  return (
    <section className="other-hint" aria-label="기타 메뉴 안내">
      <strong>푸드트럭 메뉴가 아니어도 괜찮아요!</strong>
      <p>배달 음식을 같이 시켜 먹거나 근처 식당에서 함께 먹을 밥친구를 구할 때도, 모집글의 <b>기타 메뉴 추가</b>로 원하는 메뉴를 직접 넣어 올릴 수 있어요.</p>
      <a href="/new" onClick={go}>모집글 올리기<IconChevron size={16} /></a>
    </section>
  );
}

export function Header({ back, title, right }: { back?: boolean | string; title?: string; right?: React.ReactNode }) {
  const navigate = useNavigate();
  // 앱 안에서 넘어온 화면이면 직전 화면으로(스크롤·펼친 메뉴도 그대로), 주소로 바로 들어왔으면 back에 적힌 곳(없으면 홈)으로
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(typeof back === 'string' ? back : '/');
  };
  return (
    <header className="header">
      {back && <button type="button" className="back" aria-label="뒤로" onClick={goBack}><IconBack /></button>}
      {title ? <h1 className="title">{title}</h1> : (
        <>
          <Link to="/" className="logo" aria-label="한입팟"><img className="mark" src="/logo-84.png?v=2" alt="" width={30} height={30} /><span>한입팟</span></Link>
          <button type="button" className="refresh" aria-label="새로고침" onClick={() => location.reload()}><IconRefresh /></button>
        </>
      )}
      <div className="spacer" />
      {right}
    </header>
  );
}

export function BottomNav() {
  const { user, requireLogin } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const guard = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) navigate(to);
    else requireLogin(to);
  };
  const cls = (active: boolean) => (active ? 'active' : '');
  return (
    <nav className="nav" aria-label="주요 메뉴">
      <div className="nav-inner">
        <NavLink to="/" end className={({ isActive }) => cls(isActive)}><IconClock />시간별</NavLink>
        <NavLink to="/menu" className={({ isActive }) => cls(isActive)}><IconMenu />메뉴별</NavLink>
        <a href="/new" onClick={guard('/new')} className={cls(pathname.startsWith('/new'))}><IconPlus />등록</a>
        <a href="/me" onClick={guard('/me')} className={cls(pathname === '/me' || pathname.startsWith('/me/'))}><IconUser />내정보</a>
      </div>
    </nav>
  );
}
