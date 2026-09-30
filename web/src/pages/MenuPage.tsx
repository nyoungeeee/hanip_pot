import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, MenuWithCounts, PostSummary, Vendor } from '../api';
import { useApp, useOpenOnly, useSelectedDay } from '../app-context';
import { Header } from '../components/Layout';
import { IconChevron } from '../components/Icons';
import { byVendor, DayTabs, ErrorState, MenuPostCard, OpenOnlyToggle, SearchBox, Spinner, Thumb, VendorFilter, InfoList } from '../components/ui';
import { filterVendors, won } from '../format';

function MenuBadge({ m }: { m: MenuWithCounts }) {
  if (m.openCount > 0) return <span className="badge open">모집중 {m.openCount}건</span>;
  if (m.closedCount > 0) return <span className="badge closed">모집종료</span>;
  return <span className="badge none">모임 없음</span>;
}

export default function MenuPage() {
  const { meta, user, requireLogin } = useApp();
  const [day, setDay] = useSelectedDay();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor<MenuWithCounts>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [posts, setPosts] = useState<Record<number, PostSummary[] | 'loading' | 'error'>>({});
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useOpenOnly();
  const [vendorIds, setVendorIds] = useState<number[]>([]);

  const load = useCallback(() => {
    if (!day) return;
    setError(null);
    setVendors(null);
    setPosts({});
    api.vendors(day).then((r) => setVendors(r.vendors)).catch((e) => setError(e.message));
  }, [day]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (menuId: number) => {
    if (expanded === menuId) return setExpanded(null);
    setExpanded(menuId);
    if (!day) return;
    setPosts((p) => ({ ...p, [menuId]: 'loading' }));
    api.posts(day, menuId)
      .then((r) => setPosts((p) => ({ ...p, [menuId]: r.posts })))
      .catch(() => setPosts((p) => ({ ...p, [menuId]: 'error' })));
  };

  const open = (id: number) => (user ? navigate(`/posts/${id}`) : requireLogin(`/posts/${id}`));
  const byStatus = (vendors ?? [])
    .map((v) => (openOnly ? { ...v, menus: v.menus.filter((m) => m.openCount > 0) } : v))
    .filter((v) => v.menus.length > 0);
  const shown = filterVendors(byVendor(byStatus, vendorIds), query);

  return (
    <>
      <Header right={<OpenOnlyToggle value={openOnly} onChange={setOpenOnly} />} />
      <main className="page">
        {meta && day && <DayTabs days={meta.days} value={day} onChange={setDay} />}
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !vendors ? (
          <Spinner />
        ) : (
          <>
            <SearchBox value={query} onChange={setQuery} />
            {byStatus.length > 0 && <VendorFilter vendors={byStatus} selected={vendorIds} onChange={setVendorIds} />}
            {shown.length === 0 && (
              <div className="search-empty">
                {query ? `'${query}'에 맞는 ${openOnly ? '모집중인 ' : ''}메뉴가 없어요.` : openOnly ? '이 날 모집중인 팟이 아직 없어요.' : '메뉴가 없어요.'}
              </div>
            )}
            {shown.map((v) => (
              <section key={v.id} className="vendor" id={`vendor-${v.id}`} aria-label={v.name}>
                <div className="vendor-head">
                  <h3>{v.name}</h3>
                  {!v.isOfficial ? <span>이용자 추가</span> : v.zone && <span>{v.zone}</span>}
                </div>
                {v.menus.map((m) => {
                  const loaded = posts[m.id];
                  const list = Array.isArray(loaded) && openOnly ? loaded.filter((p) => p.status === 'OPEN') : loaded;
                  const isOpen = expanded === m.id;
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      <button type="button" className="menu-row" aria-expanded={isOpen} onClick={() => toggle(m.id)}>
                        <Thumb src={m.image} />
                        <div className="info">
                          <div className="name">{m.name}{!m.isOfficial && <> <span className="tag">기타</span></>}</div>
                          {m.price != null && <div className="price">{won(m.price)}</div>}
                        </div>
                        <MenuBadge m={m} />
                        <span className="chev"><IconChevron /></span>
                      </button>
                      {isOpen && (
                        <div className="menu-posts" role="region" aria-label={`${m.name} 모집글`}>
                          {list === 'loading' || !list ? (
                            <div className="empty">불러오는 중…</div>
                          ) : list === 'error' ? (
                            <div className="empty">불러오지 못했어요. 다시 눌러 주세요.</div>
                          ) : list.length === 0 ? (
                            <div className="empty">아직 이 메뉴로 모인 팟이 없어요. 첫 모집글을 올려 보세요.</div>
                          ) : (
                            <>
                              <div className="menu-posts-label">이 메뉴의 모집글 {list.length}건</div>
                              {list.map((p) => <MenuPostCard key={p.id} post={p} menuId={m.id} onOpen={open} />)}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
            <InfoList
              style={{ marginTop: 4 }}
              items={['일부 사진은 업체 대표 이미지라 메뉴와 다를 수 있어요.', '가격은 현장에서 달라질 수 있어요.']}
            />
          </>
        )}
      </main>
    </>
  );
}
