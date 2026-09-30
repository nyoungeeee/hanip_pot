import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError, PostDetail } from '../api';
import { useApp } from '../app-context';
import { COPY } from '../copy';
import { Header } from '../components/Layout';
import { IconLock } from '../components/Icons';
import { Empty, ErrorState, Spinner, StatusBadge, Thumb } from '../components/ui';
import { longDay, menuSubLine } from '../format';

export default function PostDetailPage() {
  const { id } = useParams();
  const { handleAuthError, toast } = useApp();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.post(Number(id))
      .then((r) => setPost(r.post))
      .catch((e: ApiError) => {
        if (!handleAuthError(e)) setError(e);
      });
  }, [id, handleAuthError]);
  useEffect(() => {
    load();
  }, [load]);

  const copyLink = async () => {
    if (!post?.openChatUrl) return;
    try {
      await navigator.clipboard.writeText(post.openChatUrl);
      toast('오픈카톡 링크를 복사했어요.');
    } catch {
      toast(post.openChatUrl);
    }
  };

  if (error?.status === 404) {
    return (
      <>
        <Header back />
        <main className="page"><Empty title="모집글을 찾을 수 없어요" action={{ to: '/', label: '목록으로' }}>취소되었거나 없는 글이에요.</Empty></main>
      </>
    );
  }

  return (
    <>
      <Header back />
      <main className="page">
        {error ? (
          <ErrorState message={error.message} onRetry={load} />
        ) : !post ? (
          <Spinner />
        ) : (
          <article>
            <div className="row" style={{ alignItems: 'flex-start', margin: '4px 0 12px' }}>
              <h2 className="grow" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>{post.title}</h2>
              <StatusBadge status={post.status} />
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <dl className="kv" style={{ margin: 0 }}>
                <dt>일시</dt>
                <dd>{longDay(post.day)} {post.time}</dd>
                <dt>메뉴</dt>
                <dd>
                  <div className="detail-menus">
                    {post.menus.map((m) => (
                      <div key={m.id} className="detail-menu">
                        <Thumb src={m.image} size={44} />
                        <div className="grow">
                          <div className="n">{m.name}</div>
                          <div className="v">{menuSubLine(m)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </dd>
                <dt>희망 인원</dt>
                <dd>{post.targetPeople}명</dd>
                <dt>총대</dt>
                <dd>{post.organizerNickname}{post.isMine && <span className="tag" style={{ marginLeft: 6 }}>내 글</span>}</dd>
              </dl>
            </div>

            <div className="card" style={{ whiteSpace: 'pre-wrap', marginBottom: 14, fontSize: 14.5 }}>{post.description}</div>

            {post.status === 'OPEN' && post.openChatUrl ? (
              <>
                <div className="notice" style={{ marginBottom: 12 }}>{COPY.detailEtiquette}</div>
                <a className="btn primary" href={post.openChatUrl} target="_blank" rel="noopener noreferrer">
                  오픈카톡으로 이동
                </a>
                <p className="small muted center" style={{ marginTop: 8 }}>
                  카카오톡 오픈채팅으로 이동해요. 열리지 않으면{' '}
                  <button type="button" className="link-btn" style={{ padding: 0, fontSize: 'inherit' }} onClick={copyLink}>링크 복사</button>
                </p>
              </>
            ) : (
              <div className="notice gray center" style={{ padding: 18 }}>
                <div className="row" style={{ justifyContent: 'center', color: 'var(--ink)', fontWeight: 600, marginBottom: 4 }}>
                  <IconLock size={18} />
                  {post.status === 'CANCELLED' ? '취소한 모집글이에요.' : '모집이 종료된 글이에요.'}
                </div>
                {post.status === 'CANCELLED'
                  ? '다른 사람에게는 보이지 않아요.'
                  : post.closeReason === 'EXPIRED'
                    ? '모임 시간이 지나 모집이 종료되었어요.'
                    : '총대가 모집을 종료했어요.'}
              </div>
            )}

            {post.isMine && (
              <div className="center" style={{ marginTop: 16 }}>
                <Link className="link-btn" to="/me/posts">내 모집글에서 관리하기</Link>
              </div>
            )}
          </article>
        )}
      </main>
    </>
  );
}
