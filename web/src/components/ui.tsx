import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { MenuRef, PostStatus, PostSummary } from '../api';
import { menuLine } from '../format';
import { IconClose, IconImage } from './Icons';

export function StatusBadge({ status }: { status: PostStatus }) {
  if (status === 'OPEN') return <span className="badge open">모집중</span>;
  if (status === 'CLOSED') return <span className="badge closed">모집종료</span>;
  return <span className="badge cancelled">취소됨</span>;
}

export function Thumb({ src, size = 56, alt = '' }: { src: string | null | undefined; size?: number; alt?: string }) {
  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {src ? <img src={src} alt={alt} loading="lazy" width={size} height={size} /> : <IconImage size={Math.round(size * 0.36)} />}
    </div>
  );
}

export function firstImage(menus: MenuRef[]): string | null {
  return menus.find((m) => m.image)?.image ?? null;
}

export function PostCard({ post, onOpen }: { post: PostSummary; onOpen: (id: number) => void }) {
  return (
    <button type="button" className={`post-card${post.status !== 'OPEN' ? ' is-closed' : ''}`} onClick={() => onOpen(post.id)}>
      <Thumb src={firstImage(post.menus)} size={64} />
      <div className="body">
        <div className="top">
          <div className="ttl">{post.title}</div>
          <StatusBadge status={post.status} />
        </div>
        <div className="sub">{menuLine(post.menus)}</div>
        <div className="meta">희망 인원 {post.targetPeople}명</div>
      </div>
    </button>
  );
}

export function DayTabs({ days, value, onChange }: { days: { date: string; label: string }[]; value: string; onChange: (d: string) => void }) {
  return (
    <div className="days" role="group" aria-label="날짜 선택">
      {days.map((d) => (
        <button key={d.date} type="button" aria-pressed={d.date === value} onClick={() => onChange(d.date)}>
          {d.label}
        </button>
      ))}
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEscape(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close" aria-label="닫기" onClick={onClose}><IconClose /></button>
        {children}
      </div>
    </div>
  );
}

export function Dialog({ title, body, cancelLabel, confirmLabel, onCancel, onConfirm, busy }: {
  title: string; body: React.ReactNode; cancelLabel: string; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void; busy?: boolean;
}) {
  useEscape(onCancel);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="center">{title}</h2>
        <p className="center">{body}</p>
        <div className="btn-row">
          <button ref={ref} type="button" className="btn ghost small" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn primary small" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Spinner({ label = '불러오는 중…' }: { label?: string }) {
  return <div className="spinner" role="status">{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <strong>불러오지 못했어요</strong>
      {message}
      {onRetry && <div><button type="button" className="btn outline small" style={{ width: 'auto' }} onClick={onRetry}>다시 시도</button></div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: { to: string; label: string } }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children}
      {action && <div><Link className="btn outline small" style={{ width: 'auto' }} to={action.to}>{action.label}</Link></div>}
    </div>
  );
}
