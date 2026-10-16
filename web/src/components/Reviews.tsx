import { useState } from 'react';
import { api, ApiError, HideReason, Review, Verdict } from '../api';
import { useApp } from '../app-context';
import { shortDateTime } from '../format';
import { IconCheck } from './Icons';
import { InfoList, Sheet } from './ui';

export const VERDICT_LABEL: Record<Verdict, string> = { GOOD: '추천해요', MEH: '아쉬워요' };
export const HIDE_REASON_LABEL: Record<HideReason, string> = {
  ABUSE: '욕설·비방',
  AD: '광고·홍보',
  OFFTOPIC: '메뉴와 무관',
  PRIVACY: '개인정보 노출',
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return <span className={`verdict ${verdict === 'GOOD' ? 'good' : 'meh'}`}>{VERDICT_LABEL[verdict]}</span>;
}

/** 후기 한 개. 운영자에게는 숨기기/복구 버튼이 보인다. */
export function ReviewCard({ review, isAdmin, onHide, onUnhide }: {
  review: Review; isAdmin: boolean; onHide: (r: Review) => void; onUnhide: (r: Review) => void;
}) {
  return (
    <article className={`review-card${review.hidden ? ' is-hidden' : ''}`}>
      <div className="review-meta">
        <b>{review.nickname}</b>
        {review.isMine && <span className="tag">내 후기</span>}
        <VerdictChip verdict={review.verdict} />
        <span className="grow" />
        <time dateTime={review.createdAt}>{shortDateTime(review.createdAt)}</time>
      </div>
      <p className="review-body">{review.body}</p>
      {isAdmin && (
        <div className="review-admin">
          {review.hidden ? (
            <>
              <span>숨김 · {HIDE_REASON_LABEL[review.hidden.reason]}</span>
              <button type="button" className="admin-btn on" onClick={() => onUnhide(review)}>복구</button>
            </>
          ) : (
            <button type="button" className="admin-btn" onClick={() => onHide(review)}>숨기기</button>
          )}
        </div>
      )}
    </article>
  );
}

export function ReviewSheet({ menuId, menuName, rules, onClose, onDone }: {
  menuId: number; menuName: string; rules: { bodyMin: number; bodyMax: number }; onClose: () => void; onDone: () => void;
}) {
  const { handleAuthError, toast } = useApp();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const len = [...body.trim()].length;

  const submit = async () => {
    if (!verdict) return setErr('추천해요 또는 아쉬워요를 골라 주세요.');
    if (len < rules.bodyMin) return setErr(`후기를 ${rules.bodyMin}자 이상 써 주세요.`);
    setErr(null);
    setBusy(true);
    try {
      await api.createReview(menuId, { body: body.trim(), verdict });
      toast('후기를 남겼어요.');
      onDone();
    } catch (e) {
      if (!handleAuthError(e)) setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="후기 쓰기">
      <h2>{menuName} 후기 쓰기</h2>
      <div className="seg" role="group" aria-label="추천 여부" style={{ margin: '12px 0' }}>
        {(['GOOD', 'MEH'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={verdict === v} onClick={() => setVerdict(v)}>{VERDICT_LABEL[v]}</button>
        ))}
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label htmlFor="review-body" className="sr-only">후기 내용</label>
        <textarea
          id="review-body" className="textarea" maxLength={rules.bodyMax} value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="맛, 양, 줄 서는 시간처럼 다음 사람에게 도움이 될 이야기를 남겨 주세요."
        />
        <div className="counter">{len}/{rules.bodyMax}</div>
      </div>
      <InfoList
        style={{ marginBottom: 12 }}
        items={[
          '사진·링크·연락처는 올릴 수 없어요.',
          '등록한 후기는 수정할 수 없고, 내정보 > 내 후기에서 삭제만 할 수 있어요.',
          '운영 원칙에 맞지 않는 후기는 운영자가 숨길 수 있어요.',
          err && { text: err, warn: true },
        ]}
      />
      <button type="button" className="btn primary" onClick={submit} disabled={busy}>후기 등록</button>
    </Sheet>
  );
}

export function HideSheet({ review, onClose, onDone }: { review: Review; onClose: () => void; onDone: () => void }) {
  const { handleAuthError, toast } = useApp();
  const [reason, setReason] = useState<HideReason | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await api.hideReview(review.id, reason);
      toast('후기를 숨겼어요.');
      onDone();
    } catch (e) {
      if (!handleAuthError(e)) toast((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} label="후기 숨기기">
      <h2>후기 숨기기</h2>
      <p className="muted" style={{ marginBottom: 12 }}>"{review.body.length > 40 ? `${review.body.slice(0, 40)}…` : review.body}"</p>
      <div className="stack" role="radiogroup" aria-label="숨기는 이유" style={{ gap: 6, marginBottom: 14 }}>
        {(Object.keys(HIDE_REASON_LABEL) as HideReason[]).map((r) => (
          <button key={r} type="button" role="radio" aria-checked={reason === r} className="pick-row" onClick={() => setReason(r)}>
            <span className="pick-box">{reason === r && <IconCheck />}</span>
            {HIDE_REASON_LABEL[r]}
          </button>
        ))}
      </div>
      <InfoList style={{ marginBottom: 12 }} items={['숨긴 후기는 공개 목록과 후기 수에서 빠져요.', '작성자에게는 이유 없이 "운영자가 숨김"으로만 보여요.']} />
      <button type="button" className="btn primary" onClick={submit} disabled={!reason || busy}>숨기기</button>
    </Sheet>
  );
}
