import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useApp } from '../app-context';
import { NOTICE } from '../copy';
import { IconBack, IconClock, IconMenu, IconPlus, IconRefresh, IconUser } from './Icons';

/** 화면 맨 위 공지. 같은 문구를 두 번 이어 붙여 -50%만큼 흘리면 끊김 없이 반복된다. */
export function NoticeBanner() {
  if (!NOTICE) return null;
  return (
    <div className="topnotice" role="note">
      <div className="topnotice-track">
        <span>{NOTICE}</span>
        <span aria-hidden="true">{NOTICE}</span>
      </div>
    </div>
  );
}

export function Header({ back, title, right }: { back?: boolean | string; title?: string; right?: React.ReactNode }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <header className="header">
      {back && <button type="button" className="back" aria-label="뒤로" onClick={goBack}><IconBack /></button>}
      {title ? <h1 className="title">{title}</h1> : (
        <>
          <Link to="/" className="logo"><img src="/logo-84.png" alt="" width={28} height={28} />한입팟<small>(부락편)</small></Link>
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
