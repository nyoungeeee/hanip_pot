import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { loginUrl } from '../api';
import { useApp } from '../app-context';
import { COPY } from '../copy';
import { Header } from '../components/Layout';
import { IconLock, IconUser } from '../components/Icons';
import { Spinner } from '../components/ui';
import { NicknameForm } from './MePages';

function safeReturn(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

// ---------------- A2: 성별 정보 확인 불가 ----------------

export function DeniedPage() {
  const [params] = useSearchParams();
  const reason = params.get('reason');
  const returnTo = safeReturn(params.get('returnTo'));
  const content = {
    missing: {
      title: '성별 정보를 확인할 수 없어요',
      body: '카카오 로그인 때 성별 정보 제공에 동의하지 않았거나, 카카오 계정에 성별 정보가 없어요. 카카오 계정 설정에서 성별 정보를 확인한 뒤 제공에 동의해 주세요.',
      retry: loginUrl(returnTo, 'gender'),
    },
    other: {
      title: '이용할 수 없는 계정이에요',
      body: '현재 한입팟은 카카오 계정의 성별 정보가 여성으로 확인된 이용자만 모집글 상세보기와 등록을 이용할 수 있어요. 공개된 메뉴별·시간별 목록은 계속 볼 수 있어요.',
      retry: null,
    },
    cancelled: {
      title: '로그인을 취소했어요',
      body: '모집글 상세보기와 등록은 카카오 로그인 후 이용할 수 있어요.',
      retry: loginUrl(returnTo),
    },
  }[reason ?? ''] ?? {
    title: '로그인하지 못했어요',
    body: '잠시 후 다시 시도해 주세요. 문제가 계속되면 브라우저를 새로 열어 시도해 주세요.',
    retry: loginUrl(returnTo),
  };
  return (
    <>
      <Header />
      <main className="page center" style={{ paddingTop: 40 }}>
        <div className="icon-circle" style={{ width: 64, height: 64 }}><IconLock size={26} /></div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10 }}>{content.title}</h2>
        <p className="muted" style={{ marginBottom: 26 }}>{content.body}</p>
        <div className="stack">
          {content.retry && <a className="btn primary" href={content.retry}>다시 시도하기</a>}
          <Link className="btn outline" to="/" replace>목록으로 돌아가기</Link>
        </div>
      </main>
    </>
  );
}

// ---------------- A3: 첫 로그인 닉네임 ----------------

export function WelcomePage() {
  const { user, userLoaded, setUser, handleAuthError } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = safeReturn(params.get('returnTo'));
  if (!userLoaded) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  return (
    <>
      <Header />
      <main className="page" style={{ paddingTop: 28 }}>
        <div className="icon-circle" style={{ width: 64, height: 64 }}><IconUser size={26} /></div>
        <h2 className="center" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>어떻게 불러드릴까요?</h2>
        <p className="center muted" style={{ marginBottom: 22 }}>한입팟에서 사용할 닉네임이에요. 모집글 상세에서 다른 이용자에게 보여요.</p>
        <NicknameForm
          initial={user.nickname}
          cta="시작하기"
          onSaved={(u) => {
            setUser(u);
            navigate(returnTo, { replace: true });
          }}
          onAuthError={(e) => handleAuthError(e, '/')}
        />
        <p className="small muted center" style={{ marginTop: 14 }}>닉네임은 내정보에서 언제든 바꿀 수 있어요.</p>
      </main>
    </>
  );
}

// ---------------- 이용 안내 ----------------

export function GuidePage() {
  return (
    <>
      <Header back title="이용 안내" />
      <main className="page">
        <div className="stack" style={{ fontSize: 14.5 }}>
          <section className="card">
            <h3 style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 6 }}>한입팟은 이런 곳이에요</h3>
            <p className="muted">부산락페에 혼자 온 여성 이용자가 F&B 메뉴를 이것저것 맛볼 수 있도록, 같은 메뉴를 원하는 시간에 함께 나눠 먹을 사람을 찾는 곳이에요.</p>
          </section>
          <section className="card">
            <h3 style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 6 }}>이용 방법</h3>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>메뉴별·시간별 목록에서 모집글을 찾아요.</li>
              <li>카카오로 로그인하면 상세 내용과 오픈카톡 링크를 볼 수 있어요.</li>
              <li>대화, 만나는 곳, 주문과 정산은 오픈카톡에서 참여자끼리 정해요.</li>
              <li>직접 총대가 되어 모집글을 올릴 수도 있어요.</li>
            </ol>
          </section>
          <section className="card">
            <h3 style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 6 }}>함께 지켜 주세요</h3>
            {COPY.guideline.map((p) => <p key={p} className="muted" style={{ marginBottom: 6 }}>{p}</p>)}
          </section>
          <section className="card">
            <h3 style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 6 }}>로그인과 성별 정보</h3>
            <p className="muted">한입팟은 카카오 계정에 등록된 성별 정보를 확인해 여성 이용자에게만 상세보기와 등록을 열어 두고 있어요. 이것은 법적 신원이나 실제 성별을 검증하는 절차가 아니에요. 성별 값은 확인에만 쓰고 저장하지 않으며, 다른 프로필 정보는 요구하지 않아요.</p>
          </section>
        </div>
      </main>
    </>
  );
}
