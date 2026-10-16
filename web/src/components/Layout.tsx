import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useApp } from '../app-context';
import { NOTICE } from '../copy';
import { IconBack, IconChevron, IconClock, IconMenu, IconPlus, IconRefresh, IconUser } from './Icons';

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
          <Link to="/" className="logo" aria-label="INMUFE 한입팟"><img src="/inmufe/logo.webp" alt="" width={77} height={34} /><span>한입팟</span></Link>
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
