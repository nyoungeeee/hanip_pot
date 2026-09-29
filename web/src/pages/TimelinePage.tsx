import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, TimelineGroup } from '../api';
import { useApp, useSelectedDay } from '../app-context';
import { Header } from '../components/Layout';
import { DayTabs, Empty, ErrorState, PostCard, Spinner } from '../components/ui';
import { shortDay } from '../format';

export default function TimelinePage() {
  const { meta, user, requireLogin } = useApp();
  const [day, setDay] = useSelectedDay();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<TimelineGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!day) return;
    setError(null);
    setGroups(null);
    api.timeline(day).then((r) => setGroups(r.groups)).catch((e) => setError(e.message));
  }, [day]);
  useEffect(() => {
    load();
  }, [load]);

  const open = (id: number) => (user ? navigate(`/posts/${id}`) : requireLogin(`/posts/${id}`));
  const now = new Date().toISOString();

  return (
    <>
      <Header />
      <main className="page">
        {meta && day && <DayTabs days={meta.days} value={day} onChange={setDay} />}
        {day && <h2 className="section-title">시간별 · {shortDay(day)}</h2>}
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !groups ? (
          <Spinner />
        ) : groups.length === 0 ? (
          <Empty title="아직 이 날의 모집글이 없어요" action={{ to: '/new', label: '모집글 올리기' }}>
            먹고 싶은 메뉴가 있다면 먼저 팟을 열어 보세요.
          </Empty>
        ) : (
          <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {groups.map((g) => (
              <li key={g.meetupAt} className={`tl-group${g.meetupAt <= now ? ' past' : ''}`}>
                <div className="tl-rail" aria-hidden="true">
                  <span className="tl-time">{g.time}</span>
                  <span className="tl-dot" />
                  <span className="tl-line" />
                </div>
                <div className="tl-cards">
                  <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{g.time}</span>
                  {g.posts.map((p) => <PostCard key={p.id} post={p} onOpen={open} />)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}
