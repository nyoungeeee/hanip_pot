import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, PostDetail, PostStatus } from '../api';
import { useApp } from '../app-context';
import { Header } from '../components/Layout';
import { IconChevron, IconDoc, IconHelp, IconLogout, IconPencil } from '../components/Icons';
import {
  CatalogGate, DetailsForm, Draft, FieldErrors, mapServerErrors, MenuPicker, toBody, validateDetails, validateMenus,
} from '../components/PostForm';
import { Dialog, Empty, ErrorState, Sheet, Spinner, StatusBadge, Thumb } from '../components/ui';
import { longDay } from '../format';

// ---------------- P1: 내정보 ----------------

export function MePage() {
  const { user, signOut, toast } = useApp();
  const navigate = useNavigate();
  const [count, setCount] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.myPosts().then((r) => setCount(r.posts.filter((p) => p.status !== 'CANCELLED').length)).catch(() => {});
  }, []);

  const logout = async () => {
    await api.logout().catch(() => {});
    // 홈으로 먼저 옮긴 뒤 비운다. 순서가 반대면 내정보 화면이 "로그인 필요"로 바뀌며
    // 로그인 시트(돌아갈 곳 = 내정보)를 띄워서, 다시 로그인하면 이전 화면으로 돌아가 버린다.
    navigate('/', { replace: true });
    signOut();
    toast('로그아웃했어요.');
  };

  return (
    <>
      <Header />
      <main className="page">
        <div className="row" style={{ alignItems: 'flex-end', padding: '12px 0 22px', borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
          <div className="grow">
            <div style={{ fontSize: 19, fontWeight: 600 }}>{user!.nickname}님</div>
            <div className="muted">안녕하세요!</div>
          </div>
          <button type="button" className="link-btn row" style={{ gap: 4 }} onClick={() => setEditing(true)}><IconPencil />닉네임 수정</button>
        </div>
        <nav className="list-menu">
          <Link to="/me/posts"><span className="ic"><IconDoc /></span><span className="grow">내 모집글</span>{count !== null && <span className="count">{count}건</span>}<IconChevron /></Link>
          <Link to="/guide"><span className="ic"><IconHelp /></span><span className="grow">이용 안내</span><IconChevron /></Link>
          <button type="button" onClick={logout}><span className="ic"><IconLogout /></span><span className="grow">로그아웃</span><IconChevron /></button>
        </nav>
        <Link to="/me/withdraw" className="withdraw-link">회원 탈퇴</Link>
      </main>
      {editing && <NicknameSheet onClose={() => setEditing(false)} />}
    </>
  );
}

function NicknameSheet({ onClose }: { onClose: () => void }) {
  const { user, setUser, toast, handleAuthError } = useApp();
  return (
    <Sheet onClose={onClose} label="닉네임 수정">
      <h2>닉네임 수정</h2>
      <NicknameForm
        initial={user!.nickname}
        cta="저장"
        onSaved={(u) => {
          setUser(u);
          toast('닉네임을 바꿨어요.');
          onClose();
        }}
        onAuthError={(e) => handleAuthError(e)}
      />
    </Sheet>
  );
}

export function NicknameForm({ initial, cta, onSaved, onAuthError }: {
  initial: string; cta: string; onSaved: (u: NonNullable<ReturnType<typeof useApp>['user']>) => void; onAuthError: (e: unknown) => boolean;
}) {
  const [value, setValue] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onSaved((await api.updateMe(value.trim())).user);
    } catch (e) {
      if (onAuthError(e)) return;
      const ae = e as ApiError;
      if (ae.code === 'NICKNAME_TAKEN' && typeof ae.data.suggestion === 'string') {
        setValue(ae.data.suggestion);
        setErr(`이미 사용 중이라 '${ae.data.suggestion}'(으)로 바꿔 두었어요. 괜찮으면 한 번 더 눌러 주세요.`);
      } else setErr(ae.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save}>
      <div className="field">
        <input className="input" aria-label="닉네임" value={value} maxLength={12} onChange={(e) => setValue(e.target.value)} aria-invalid={!!err} />
        <span className="hint">한글·영문·숫자·_ 2~12자. 모집글 상세에서 다른 이용자에게 보여요.</span>
        {err && <span className="err" role="alert">{err}</span>}
      </div>
      <button className="btn primary" disabled={busy || !value.trim()}>{cta}</button>
    </form>
  );
}

// ---------------- P2: 내 모집글 ----------------

const FILTERS: { key: PostStatus; label: string }[] = [
  { key: 'OPEN', label: '모집중' },
  { key: 'CLOSED', label: '모집종료' },
  { key: 'CANCELLED', label: '취소한 글' },
];

export function MyPostsPage() {
  const { handleAuthError, toast } = useApp();
  const [posts, setPosts] = useState<PostDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PostStatus>('OPEN');
  const [confirm, setConfirm] = useState<{ kind: 'close' | 'cancel'; post: PostDetail } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.myPosts().then((r) => setPosts(r.posts)).catch((e) => !handleAuthError(e) && setError(e.message));
  }, [handleAuthError]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const { post } = confirm.kind === 'close' ? await api.closePost(confirm.post.id) : await api.cancelPost(confirm.post.id);
      setPosts((ps) => ps!.map((p) => (p.id === post.id ? post : p)));
      toast(confirm.kind === 'close' ? '모집을 종료했어요.' : '모집글을 취소했어요.');
      setConfirm(null);
    } catch (e) {
      if (!handleAuthError(e)) {
        toast((e as ApiError).message);
        setConfirm(null);
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const shown = posts?.filter((p) => p.status === filter) ?? [];
  return (
    <>
      <Header back="/me" title="내 모집글" />
      <main className="page">
        <div className="filter-tabs" role="group" aria-label="상태 필터">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}{posts && ` (${posts.filter((p) => p.status === f.key).length})`}
            </button>
          ))}
        </div>
        {error ? <ErrorState message={error} onRetry={load} /> : !posts ? <Spinner /> : shown.length === 0 ? (
          filter === 'OPEN' ? <Empty title="모집중인 글이 없어요" action={{ to: '/new', label: '모집글 올리기' }} /> : <Empty title="해당하는 글이 없어요" />
        ) : (
          <div className="stack">
            {shown.map((p) => (
              <article key={p.id} className="card" style={{ padding: 14 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <Link to={`/posts/${p.id}`} className="grow" style={{ fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>{p.title}</Link>
                  <StatusBadge status={p.status} />
                </div>
                <div className="menu-thumbs">
                  {p.menus.map((m) => <figure key={m.id}><Thumb src={m.image} size={28} /><figcaption>{m.name}</figcaption></figure>)}
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  {longDay(p.day)} {p.time} · 희망 인원 {p.targetPeople}명
                  {p.status === 'CLOSED' && p.closeReason === 'EXPIRED' && ' · 시간 경과로 종료'}
                </div>
                {p.status === 'OPEN' && (
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <Link className="btn outline small" to={`/me/posts/${p.id}/edit`}>수정</Link>
                    <button type="button" className="btn primary small" onClick={() => setConfirm({ kind: 'close', post: p })}>모집 종료</button>
                  </div>
                )}
                {p.status === 'CLOSED' && (
                  <div style={{ marginTop: 6, textAlign: 'right' }}>
                    <button type="button" className="link-btn" onClick={() => setConfirm({ kind: 'cancel', post: p })}>목록에서 내리기(취소)</button>
                  </div>
                )}
                {p.status === 'CANCELLED' && <div className="small muted" style={{ marginTop: 6 }}>다른 이용자에게는 보이지 않아요.</div>}
              </article>
            ))}
          </div>
        )}
      </main>
      {confirm?.kind === 'close' && (
        <Dialog title="모집을 종료할까요?" body={<>종료하면 목록에서 모집종료로 표시되고<br />오픈카톡 참여 버튼이 사라져요.</>}
          cancelLabel="계속 모집하기" confirmLabel="모집 종료" busy={busy} onCancel={() => setConfirm(null)} onConfirm={act} />
      )}
      {confirm?.kind === 'cancel' && <CancelDialog busy={busy} onCancel={() => setConfirm(null)} onConfirm={act} />}
    </>
  );
}

function CancelDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog title="모집글을 취소할까요?" body={<>취소한 글은 목록에서 보이지 않고<br />내 모집글에 남아요.</>}
      cancelLabel="돌아가기" confirmLabel="모집 취소" busy={busy} onCancel={onCancel} onConfirm={onConfirm} />
  );
}

// ---------------- P3: 글 수정 ----------------

export function EditPostPage() {
  const { id } = useParams();
  const { meta, handleAuthError, toast } = useApp();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [menuEdit, setMenuEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    api.myPosts()
      .then((r) => {
        const p = r.posts.find((x) => x.id === Number(id));
        if (!p) return setErr('모집글을 찾을 수 없어요.');
        setPost(p);
        setDraftState({
          menuIds: p.menus.map((m) => m.id), customs: [], day: p.day, time: p.time, targetPeople: p.targetPeople,
          title: p.title, description: p.description, openChatUrl: p.openChatUrl ?? '',
        });
      })
      .catch((e) => !handleAuthError(e) && setErr(e.message));
  }, [id, handleAuthError]);

  if (err && !post) return <><Header back="/me/posts" title="내 모집글 수정" /><main className="page"><Empty title={err} action={{ to: '/me/posts', label: '내 모집글' }} /></main></>;
  if (!meta || !post || !draft) return <><Header back="/me/posts" title="내 모집글 수정" /><Spinner /></>;
  if (post.status !== 'OPEN') {
    return <><Header back="/me/posts" title="내 모집글 수정" /><main className="page"><Empty title="모집중인 글만 수정할 수 있어요" action={{ to: '/me/posts', label: '내 모집글' }} /></main></>;
  }

  const setDraft = (f: (d: Draft) => Draft) => setDraftState((d) => f(d!));
  const save = async () => {
    const e = { ...validateMenus(draft, meta.rules), ...validateDetails(draft, meta.rules) };
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.menus) setMenuEdit(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.updatePost(post.id, toBody(draft));
      toast('모집글을 수정했어요.');
      navigate('/me/posts', { replace: true });
    } catch (e) {
      if (handleAuthError(e)) return;
      const fe = mapServerErrors(e);
      if (fe) setErrors(fe);
      else setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const cancelPost = async () => {
    setBusy(true);
    try {
      await api.cancelPost(post.id);
      toast('모집글을 취소했어요.');
      navigate('/me/posts', { replace: true });
    } catch (e) {
      if (!handleAuthError(e)) setErr((e as ApiError).message);
    } finally {
      setBusy(false);
      setCancelOpen(false);
    }
  };

  return (
    <>
      <Header back="/me/posts" title="내 모집글 수정" />
      <main className="page">
        <CatalogGate>
          {(vendors) => (
            <>
              <div className="field">
                <div className="row"><span className="label grow">선택한 메뉴<span className="opt">(최대 {meta.rules.menusMax}개)</span></span>
                  <button type="button" className="link-btn" onClick={() => setMenuEdit((v) => !v)}>{menuEdit ? '접기' : '메뉴 변경'}</button></div>
                {menuEdit ? (
                  <MenuPicker draft={draft} setDraft={setDraft} vendors={vendors} extraMenus={post.menus} rules={meta.rules} error={errors.menus} />
                ) : (
                  <div className="menu-thumbs">
                    {[...post.menus, ...vendors.flatMap((v) => v.menus)]
                      .filter((m, i, a) => draft.menuIds.includes(m.id) && a.findIndex((x) => x.id === m.id) === i)
                      .map((m) => <figure key={m.id}><Thumb src={m.image} size={28} /><figcaption>{m.name}</figcaption></figure>)}
                    {draft.customs.map((c) => <figure key={c.key}><Thumb src={c.imageUrl} size={28} /><figcaption>{c.name}</figcaption></figure>)}
                  </div>
                )}
                {!menuEdit && errors.menus && <span className="err">{errors.menus}</span>}
              </div>
              <DetailsForm draft={draft} setDraft={setDraft} rules={meta.rules} days={meta.days} errors={errors} />
              {err && <div className="error-box" role="alert">{err}</div>}
              <button type="button" className="btn primary" onClick={save} disabled={busy}>수정 완료</button>
              <div className="center" style={{ marginTop: 8 }}>
                <button type="button" className="link-btn" onClick={() => setCancelOpen(true)}>모집 취소</button>
              </div>
            </>
          )}
        </CatalogGate>
      </main>
      {cancelOpen && <CancelDialog busy={busy} onCancel={() => setCancelOpen(false)} onConfirm={cancelPost} />}
    </>
  );
}

// ---------------- P6: 탈퇴 ----------------

export function WithdrawPage() {
  const { signOut, handleAuthError, toast } = useApp();
  const navigate = useNavigate();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    try {
      await api.withdraw();
      navigate('/', { replace: true });
      signOut();
      toast('탈퇴가 완료됐어요. 이용해 주셔서 고마워요.');
    } catch (e) {
      if (!handleAuthError(e)) setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Header back="/me" title="회원 탈퇴" />
      <main className="page">
        <h2 className="center" style={{ fontSize: 19, fontWeight: 600, margin: '24px 0 10px' }}>회원 탈퇴 확인</h2>
        <p className="center muted" style={{ marginBottom: 20 }}>탈퇴하면 모집 중인 글이 목록에서<br />숨겨지고 카카오 계정 연결이 해제돼요.</p>
        <div className="notice" style={{ marginBottom: 18 }}>
          <p>· 작성한 모집글은 모두 공개 목록에서 숨겨지고, 모집중인 글은 취소돼요.</p>
          <p>· 한입팟과 카카오 계정의 연결이 해제돼요. 다시 로그인하면 새 계정으로 시작해요.</p>
        </div>
        <label className="check" style={{ marginBottom: 18 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          안내 내용을 모두 확인했으며, 이에 동의합니다.
        </label>
        {err && <div className="error-box" role="alert">{err}</div>}
        <div className="btn-row">
          <button type="button" className="btn outline" onClick={() => navigate('/me')}>돌아가기</button>
          <button type="button" className="btn primary" disabled={!agree || busy} onClick={go}>탈퇴하기</button>
        </div>
      </main>
    </>
  );
}
