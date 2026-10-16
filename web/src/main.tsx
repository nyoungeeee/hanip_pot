import { Component, StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigationType } from 'react-router';
import './styles.css';
import { AppProvider, useApp } from './app-context';
import { BottomNav, Header, NoticeModal } from './components/Layout';
import { Empty, Spinner } from './components/ui';
import MenuPage from './pages/MenuPage';
import TimelinePage from './pages/TimelinePage';
import PostDetailPage from './pages/PostDetailPage';
import CreatePage, { CreateDonePage } from './pages/CreatePage';
import { EditPostPage, MePage, MyPostsPage, MyReviewsPage, WithdrawPage } from './pages/MePages';
import MenuDetailPage from './pages/MenuDetailPage';
import { DeniedPage, GuidePage, WelcomePage } from './pages/AuthPages';

/** 예전 시간별 주소(/timeline?day=...)는 메인(/)으로 넘긴다. */
function LegacyTimeline() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/', search }} replace />;
}

/** 로그인한 계정만. 비로그인이면 A1 시트, 닉네임 미확정이면 A3로. */
function Protected() {
  const { user, userLoaded, requireLogin } = useApp();
  const location = useLocation();
  const here = location.pathname + location.search;
  useEffect(() => {
    if (userLoaded && !user) requireLogin(here);
  }, [userLoaded, user, here, requireLogin]);
  if (!userLoaded) return <Spinner />;
  if (!user) {
    return (
      <>
        <Header back="/" />
        <main className="page"><Empty title="로그인이 필요해요" action={{ to: '/', label: '목록으로' }}>상세보기와 등록은 로그인 후 이용할 수 있어요.</Empty></main>
      </>
    );
  }
  if (!user.nicknameConfirmed) return <Navigate to={`/welcome?returnTo=${encodeURIComponent(here)}`} replace />;
  return <Outlet />;
}

/** 화면별 스크롤 위치(history 항목 key 기준). 뒤로 가면 떠날 때 위치로 돌려놓는다. */
const scrollByKey = new Map<string, number>();

function Shell() {
  const location = useLocation();
  const navType = useNavigationType();
  const lastPath = useRef(location.pathname);

  useEffect(() => {
    const save = () => scrollByKey.set(location.key, window.scrollY);
    // 같은 화면에서 주소만 바뀐 경우(펼친 메뉴·날짜 등 replace)는 지금 위치를 새 항목에 이어 받는다
    if (navType === 'REPLACE') save();
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [location.key, navType]);

  useEffect(() => {
    const pathChanged = lastPath.current !== location.pathname;
    lastPath.current = location.pathname;
    if (navType === 'POP') {
      // 목록은 데이터를 다시 불러온 뒤에야 길어지므로, 목표 위치에 닿을 때까지 잠깐 다시 시도한다
      const target = scrollByKey.get(location.key) ?? 0;
      const until = Date.now() + 1500;
      let raf = 0;
      const tick = () => {
        window.scrollTo(0, target);
        if (Math.abs(window.scrollY - target) > 2 && Date.now() < until) raf = requestAnimationFrame(tick);
      };
      tick();
      const stop = () => cancelAnimationFrame(raf);
      window.addEventListener('touchstart', stop, { once: true });
      window.addEventListener('wheel', stop, { once: true });
      return () => {
        stop();
        window.removeEventListener('touchstart', stop);
        window.removeEventListener('wheel', stop);
      };
    }
    if (pathChanged) window.scrollTo(0, 0);
  }, [location.key, location.pathname, navType]);
  return (
    <div className="app">
      <Outlet />
      <BottomNav />
      <NoticeModal />
    </div>
  );
}

/** 렌더 오류가 나도 빈 화면 대신 안내를 보여준다. */
class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app"><main className="page">
        <Empty title="화면을 표시하지 못했어요">잠시 후 다시 시도해 주세요.</Empty>
        <div className="center"><button type="button" className="btn outline small" style={{ width: 'auto' }} onClick={() => location.assign('/')}>처음으로</button></div>
      </main></div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<TimelinePage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="menus/:id" element={<MenuDetailPage />} />
            <Route path="timeline" element={<LegacyTimeline />} />
            <Route path="guide" element={<GuidePage />} />
            <Route path="auth/denied" element={<DeniedPage />} />
            <Route path="welcome" element={<WelcomePage />} />
            <Route element={<Protected />}>
              <Route path="posts/:id" element={<PostDetailPage />} />
              <Route path="new" element={<CreatePage />} />
              <Route path="new/done/:id" element={<CreateDonePage />} />
              <Route path="me" element={<MePage />} />
              <Route path="me/posts" element={<MyPostsPage />} />
              <Route path="me/reviews" element={<MyReviewsPage />} />
              <Route path="me/posts/:id/edit" element={<EditPostPage />} />
              <Route path="me/withdraw" element={<WithdrawPage />} />
            </Route>
            <Route path="*" element={<><Header /><main className="page"><Empty title="페이지를 찾을 수 없어요" action={{ to: '/', label: '목록으로' }} /></main></>} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
