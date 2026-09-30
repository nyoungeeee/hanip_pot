import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { MenuRef, PostStatus, PostSummary } from '../api';
import { menuLine } from '../format';
import { IconChevron, IconClose, IconImage, IconSearch } from './Icons';

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

/** 메뉴별 화면에서 펼친 메뉴 아래에 붙는 작은 카드. 사진·메뉴명은 위 메뉴 행과 겹치므로 빼고 시각을 보여준다. */
export function MenuPostCard({ post, menuId, onOpen }: { post: PostSummary; menuId: number; onOpen: (id: number) => void }) {
  const others = post.menus.filter((m) => m.id !== menuId);
  return (
    <button type="button" className={`post-card compact${post.status !== 'OPEN' ? ' is-closed' : ''}`} onClick={() => onOpen(post.id)}>
      <div className="body">
        <div className="top">
          <div className="ttl">{post.title}</div>
          <StatusBadge status={post.status} />
        </div>
        <div className="meta">{post.time} · 희망 인원 {post.targetPeople}명</div>
        {others.length > 0 && <div className="sub">함께 · {others.map((m) => m.name).join(', ')}</div>}
      </div>
    </button>
  );
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

export function SearchBox({ value, onChange, placeholder = '메뉴·업체 검색' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search" role="search">
      <IconSearch />
      <input
        type="search" enterKeyHint="search" autoComplete="off" aria-label={placeholder}
        placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {value && <button type="button" aria-label="검색어 지우기" onClick={() => onChange('')}><IconClose size={16} /></button>}
    </div>
  );
}

export function OpenOnlyToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label="모집중인 팟만 보기" className="switch" onClick={() => onChange(!value)}>
      <span className="switch-track"><span className="switch-thumb" /></span>
      모집중
    </button>
  );
}

/**
 * 업체 필터 칩. 누른 업체만 켜고 끈다(여러 개 가능). 아무것도 안 켜면 전체.
 * 한 줄일 때는 옆으로 넘기고(터치 스와이프, 마우스 드래그), 오른쪽 버튼으로 전체를 펼칠 수 있다.
 */
export function VendorFilter({ vendors, selected, onChange }: {
  vendors: { id: number; name: string }[]; selected: number[]; onChange: (ids: number[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const active = selected.filter((id) => vendors.some((v) => v.id === id));
  const toggle = (id: number) => onChange(active.includes(id) ? active.filter((x) => x !== id) : [...active, id]);

  // 마우스로 끌어서 넘기기. 터치는 브라우저 기본 스크롤을 쓴다.
  const onPointerDown = (e: React.PointerEvent) => {
    if (expanded || e.pointerType !== 'mouse' || !rowRef.current) return;
    drag.current = { x: e.clientX, left: rowRef.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !rowRef.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    rowRef.current.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    // 끌기가 끝난 직후의 click은 칩 토글로 처리하지 않는다
    if (drag.current?.moved) window.setTimeout(() => (drag.current = null), 0);
    else drag.current = null;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div className={`vendor-filter${expanded ? ' expanded' : ''}${scrolled ? ' scrolled' : ''}`}>
      <div
        ref={rowRef} className="vendor-chips" role="group" aria-label="업체 필터"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}
        onClickCapture={onClickCapture} onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 4)}
      >
        <button type="button" aria-pressed={active.length === 0} onClick={() => onChange([])}>전체</button>
        {vendors.map((v) => (
          <button key={v.id} type="button" aria-pressed={active.includes(v.id)} onClick={() => toggle(v.id)}>{v.name}</button>
        ))}
      </div>
      <button
        type="button" className="vendor-more" aria-expanded={expanded}
        aria-label={expanded ? '업체 목록 접기' : '업체 목록 모두 펼치기'} onClick={() => setExpanded((x) => !x)}
      >
        <IconChevron />
      </button>
    </div>
  );
}

/** 켜진 업체가 있으면 그 업체만 남긴다(목록에서 사라진 업체 id는 무시). */
export function byVendor<V extends { id: number }>(vendors: V[], selected: number[]): V[] {
  const active = selected.filter((id) => vendors.some((v) => v.id === id));
  return active.length ? vendors.filter((v) => active.includes(v.id)) : vendors;
}
