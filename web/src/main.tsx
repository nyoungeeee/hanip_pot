import { Component, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import './styles.css';
import { AppProvider, useApp } from './app-context';
import { BottomNav, Header, NoticeBanner } from './components/Layout';
import { Empty, Spinner } from './components/ui';
import MenuPage from './pages/MenuPage';
import TimelinePage from './pages/TimelinePage';
import PostDetailPage from './pages/PostDetailPage';
import CreatePage, { CreateDonePage } from './pages/CreatePage';
import { EditPostPage, MePage, MyPostsPage, WithdrawPage } from './pages/MePages';
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

function Shell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="app">
      <NoticeBanner />
      <Outlet />
      <BottomNav />
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
