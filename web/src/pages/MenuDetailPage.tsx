import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, MenuDetail, PostSummary, Review } from '../api';
import { useApp, useSelectedDay } from '../app-context';
import { Header } from '../components/Layout';
import { HideSheet, ReviewCard, ReviewSheet } from '../components/Reviews';
import { DayTabs, Empty, ErrorState, InfoList, MenuPostCard, Spinner, Thumb } from '../components/ui';
import { won } from '../format';

/** 메뉴 상세: 메뉴 정보 → 후기(최신순) → 이 메뉴 모집글. 읽기는 로그인 없이. */
export default function MenuDetailPage() {
  const { id } = useParams();
  const menuId = Number(id);
  const { user, meta, requireLogin, handleAuthError, toast } = useApp();
  const [day, setDay] = useSelectedDay();
  const navigate = useNavigate();
  const [data, setData] = useState<MenuDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [hiding, setHiding] = useState<Review | null>(null);
  const isAdmin = !!user?.isAdmin;

  const load = useCallback(() => {
    setError(null);
    api.menu(menuId).then(setData).catch((e: ApiError) => setError({ status: e.status, message: e.message }));
  }, [menuId]);
  // 로그인 상태가 바뀌면(내 후기·운영자 여부) 다시 불러온다
  useEffect(() => {
    load();
  }, [load, user?.id]);

  useEffect(() => {
    if (!day) return;
    setPosts(null);
    api.posts(day, menuId).then((r) => setPosts(r.posts)).catch(() => setPosts([]));
  }, [day, menuId]);

  const here = `/menus/${menuId}`;
  const write = () => (user ? setWriting(true) : requireLogin(here));
  const openPost = (pid: number) => (user ? navigate(`/posts/${pid}`) : requireLogin(`/posts/${pid}`));
  const unhide = async (r: Review) => {
    try {
      await api.unhideReview(r.id);
      toast('후기를 다시 보이게 했어요.');
      load();
    } catch (e) {
      if (!handleAuthError(e)) toast((e as ApiError).message);
    }
  };

  if (error) {
    return (
      <>
        <Header back="/menu" title="메뉴" />
        <main className="page">
          {error.status === 404 ? <Empty title="메뉴를 찾을 수 없어요" action={{ to: '/menu', label: '메뉴 목록으로' }} /> : <ErrorState message={error.message} onRetry={load} />}
        </main>
      </>
    );
  }
  if (!data) return <><Header back="/menu" title="메뉴" /><Spinner /></>;

  const { menu, summary, reviews, myReview } = data;
  return (
    <>
      <Header back="/menu" title={menu.name} />
      <main className="page">
        <section className="menu-hero">
          <Thumb src={menu.image} size={72} />
          <div className="grow">
            <div className="small muted">{menu.vendorName}{menu.vendorIsOfficial ? (menu.zone ? ` · ${menu.zone}` : '') : ' · 이용자 추가'}</div>
            <h2 className="menu-hero-name">{menu.name}</h2>
            {menu.price != null && <div className="menu-hero-price">{won(menu.price)}</div>}
          </div>
        </section>

        <section aria-labelledby="reviews-title">
          <div className="review-summary">
            <h2 id="reviews-title">후기 {summary.count}</h2>
            {summary.count > 0 && <span className="verdict-sum">추천 {summary.good} · 아쉬워요 {summary.meh}</span>}
          </div>
          {myReview ? (
            <InfoList
              style={{ marginBottom: 12 }}
              items={[
                myReview.hidden ? '내 후기는 운영자가 숨겨서 다른 사람에게 보이지 않아요.' : '이 메뉴에 후기를 남겼어요.',
                <>다시 쓰려면 <Link to="/me/reviews">내정보 &gt; 내 후기</Link>에서 지운 뒤 써 주세요.</>,
              ]}
            />
          ) : (
            <button type="button" className="btn primary" style={{ marginBottom: 14 }} onClick={write}>후기 쓰기</button>
          )}
          {reviews.length === 0 ? (
            <div className="search-empty">아직 후기가 없어요. 먹어봤다면 첫 후기를 남겨 주세요.</div>
          ) : (
            <div className="stack">
              {reviews.map((r) => <ReviewCard key={r.id} review={r} isAdmin={isAdmin} onHide={setHiding} onUnhide={unhide} />)}
            </div>
          )}
        </section>

        <section aria-labelledby="menu-posts-title" style={{ marginTop: 28 }}>
          <h2 id="menu-posts-title" className="section-title" style={{ marginBottom: 0 }}>이 메뉴 모집글</h2>
          {meta && day && <DayTabs days={meta.days} value={day} onChange={setDay} />}
          {!posts ? <Spinner /> : posts.length === 0 ? (
            <div className="search-empty">이 날 이 메뉴로 모인 팟이 없어요.</div>
          ) : (
            <div className="stack plain-posts">{posts.map((p) => <MenuPostCard key={p.id} post={p} menuId={menuId} onOpen={openPost} />)}</div>
          )}
        </section>
      </main>
      {writing && (
        <ReviewSheet
          menuId={menuId} menuName={menu.name} rules={data.rules}
          onClose={() => setWriting(false)}
          onDone={() => {
            setWriting(false);
            load();
          }}
        />
      )}
      {hiding && (
        <HideSheet
          review={hiding} onClose={() => setHiding(null)}
          onDone={() => {
            setHiding(null);
            load();
          }}
        />
      )}
    </>
  );
}
