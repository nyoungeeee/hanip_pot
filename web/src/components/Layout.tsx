import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useApp } from '../app-context';
import { IconBack, IconClock, IconMenu, IconPlus, IconUser } from './Icons';

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
      {title ? <h1 className="title">{title}</h1> : <Link to="/" className="logo"><img src="/logo-84.png" alt="" width={28} height={28} />한입팟<small>(부락편)</small></Link>}
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
