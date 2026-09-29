import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, ApiError, PostDetail } from '../api';
import { useApp } from '../app-context';
import { COPY } from '../copy';
import { Header } from '../components/Layout';
import {
  CatalogGate, DetailsForm, Draft, emptyDraft, FieldErrors, mapServerErrors, MenuPicker, selectedRefs, toBody,
  validateDetails, validateMenus,
} from '../components/PostForm';
import { Empty, Spinner, Thumb } from '../components/ui';
import { longDay, won } from '../format';
import { IconCheck } from '../components/Icons';

const DRAFT_KEY = 'hp_draft';

function loadDraft(fallbackDay: string): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyDraft(fallbackDay), ...JSON.parse(raw) };
  } catch {}
  return emptyDraft(fallbackDay);
}

export default function CreatePage() {
  const { meta, handleAuthError } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = Math.min(3, Math.max(1, Number(params.get('step')) || 1));
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (meta && !draft) setDraftState(loadDraft(meta.defaultDay));
  }, [meta, draft]);

  // 입력 유지: 로그인 만료로 나갔다 오거나 새로고침해도 남도록 세션에 저장
  const setDraft = (f: (d: Draft) => Draft) =>
    setDraftState((d) => {
      const next = f(d!);
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  if (!meta || !draft) return <><Header back="/" title="모집글 등록" /><Spinner /></>;
  const { rules } = meta;
  const go = (s: number) => {
    setParams({ step: String(s) });
    window.scrollTo(0, 0);
  };

  // 새로고침 등으로 앞 단계를 건너뛴 경우 되돌림
  if (step >= 2 && Object.keys(validateMenus(draft, rules)).length) {
    return <RedirectStep to={1} go={go} />;
  }
  if (step === 3 && Object.keys(validateDetails(draft, rules)).length) {
    return <RedirectStep to={2} go={go} />;
  }

  const next1 = () => {
    const e = validateMenus(draft, rules);
    setErrors(e);
    if (!Object.keys(e).length) go(2);
  };
  const next2 = () => {
    const e = validateDetails(draft, rules);
    setErrors(e);
    if (!Object.keys(e).length) go(3);
  };
  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { post } = await api.createPost({ ...toBody(draft), agreedGuideline: true, guidelineVersion: meta.guidelineVersion });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      navigate(`/new/done/${post.id}`, { replace: true, state: { post } });
    } catch (e) {
      if (handleAuthError(e, '/new?step=3')) return;
      const fe = mapServerErrors(e);
      if (fe) {
        setErrors(fe);
        if (fe.menus) go(1);
        else if (fe.agreement) setSubmitError(fe.agreement);
        else go(2);
      } else setSubmitError((e as ApiError).message);
    } finally {
      setSubmitting(false);
    }
  };

  const titles = ['어떤 메뉴를 함께 드실까요?', '모임 내용을 입력해 주세요', '작성한 모집글을 확인해 주세요'];

  return (
    <>
      <Header back={step > 1 ? `/new?step=${step - 1}` : '/'} title="모집글 등록" />
      <main className="page">
        <div className="steps" aria-label={`${step}/3단계`}>{[1, 2, 3].map((s) => <span key={s} className={s <= step ? 'on' : ''} />)}</div>
        <h2 className="section-title">{titles[step - 1]}</h2>
        <CatalogGate>
          {(vendors) => (
            <>
              {step === 1 && (
                <>
                  <MenuPicker draft={draft} setDraft={setDraft} vendors={vendors} extraMenus={[]} rules={rules} error={errors.menus} />
                  <div className="sticky-cta">
                    <button type="button" className="btn primary" onClick={next1}>
                      선택 완료{draft.menuIds.length + draft.customs.length > 0 && ` · ${draft.menuIds.length + draft.customs.length}개`}
                    </button>
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <DetailsForm draft={draft} setDraft={setDraft} rules={rules} days={meta.days} errors={errors} />
                  <div className="sticky-cta"><button type="button" className="btn primary" onClick={next2}>다음</button></div>
                </>
              )}
              {step === 3 && (
                <>
                  <Summary draft={draft} vendors={vendors} />
                  <div className="notice" style={{ margin: '14px 0 10px' }}>
                    <strong style={{ display: 'block', marginBottom: 6, color: 'var(--brand-ink)' }}>꼭 확인해 주세요</strong>
                    {COPY.guideline.map((p) => <p key={p}>{p}</p>)}
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                    {COPY.guidelineCheck}
                  </label>
                  {submitError && <div className="error-box" role="alert" style={{ marginTop: 10 }}>{submitError}</div>}
                  <div className="sticky-cta">
                    <button type="button" className="btn primary" disabled={!agreed || submitting} onClick={submit}>
                      {submitting ? '등록하는 중…' : '모집글 등록하기'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </CatalogGate>
      </main>
    </>
  );
}

function RedirectStep({ to, go }: { to: number; go: (s: number) => void }) {
  useEffect(() => {
    go(to);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Spinner />;
}

function Summary({ draft, vendors }: { draft: Draft; vendors: Parameters<typeof selectedRefs>[1] }) {
  const refs = selectedRefs(draft, vendors, []);
  return (
    <div className="card">
      <dl className="kv" style={{ margin: 0 }}>
        <dt>일시</dt><dd>{longDay(draft.day)} {draft.time}</dd>
        <dt>메뉴</dt>
        <dd>
          <div className="detail-menus">
            {refs.map((m) => (
              <div key={m.id} className="detail-menu">
                <Thumb src={m.image} size={40} />
                <div><div className="n">{m.name}</div><div className="v">{m.vendorName}{m.price != null && ` · ${won(m.price)}`}</div></div>
              </div>
            ))}
            {draft.customs.map((c) => (
              <div key={c.key} className="detail-menu">
                <Thumb src={c.imageUrl} size={40} />
                <div><div className="n">{c.name} <span className="tag">기타</span></div><div className="v">{c.vendorName}{c.price && ` · ${won(Number(c.price))}`}</div></div>
              </div>
            ))}
          </div>
        </dd>
        <dt>희망 인원</dt><dd>{draft.targetPeople}명</dd>
        <dt>제목</dt><dd>{draft.title}</dd>
        <dt>내용</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{draft.description}</dd>
        <dt>오픈카톡</dt><dd style={{ wordBreak: 'break-all' }}>{draft.openChatUrl}</dd>
      </dl>
    </div>
  );
}

export function CreateDonePage() {
  const { id } = useParams();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api.post(Number(id)).then((r) => setPost(r.post)).catch(() => setMissing(true));
  }, [id]);
  if (missing) return <><Header /><main className="page"><Empty title="모집글을 찾을 수 없어요" action={{ to: '/me/posts', label: '내 모집글' }} /></main></>;
  if (!post) return <><Header /><Spinner /></>;
  return (
    <>
      <Header />
      <main className="page">
        <div className="center" style={{ padding: '36px 0 20px' }}>
          <div className="icon-circle" style={{ width: 64, height: 64 }}><IconCheck size={28} /></div>
          <h2 style={{ fontSize: 19, fontWeight: 600, marginBottom: 6 }}>모집글이 등록됐어요</h2>
          <p className="muted">함께 맛볼 분들이 오픈카톡으로 찾아올 거예요.</p>
        </div>
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{post.title}</div>
          <div className="small muted">{longDay(post.day)} {post.time} · 희망 인원 {post.targetPeople}명</div>
          <div className="menu-thumbs">
            {post.menus.map((m) => (
              <figure key={m.id}><Thumb src={m.image} size={76} /><figcaption>{m.name}</figcaption></figure>
            ))}
          </div>
        </div>
        <div className="stack">
          <Link className="btn primary" to="/me/posts" replace>내 모집글 보기</Link>
          <Link className="btn outline" to={`/timeline?day=${post.day}`} replace>시간별 목록으로</Link>
        </div>
      </main>
    </>
  );
}
