import { useEffect, useState } from 'react';
import { api, ApiError, MenuRef, Rules, Vendor } from '../api';
import { useApp } from '../app-context';
import { filterVendors, matchesQuery, nearestSlot, toMeetupIso, won } from '../format';
import { IconCheck, IconClose, IconImage } from './Icons';
import { byVendor, SearchBox, Sheet, Spinner, Thumb, VendorFilter } from './ui';

export interface CustomDraft {
  key: string;
  vendorName: string;
  name: string;
  price: string;
  uploadId: string | null;
  imageUrl: string | null;
}

export interface Draft {
  menuIds: number[];
  customs: CustomDraft[];
  day: string;
  time: string; // 'HH:MM' 또는 ''
  targetPeople: number;
  title: string;
  description: string;
  openChatUrl: string;
}

export const emptyDraft = (day: string): Draft => ({
  menuIds: [], customs: [], day, time: '', targetPeople: 4, title: '', description: '', openChatUrl: '',
});

export type FieldErrors = Partial<Record<'menus' | 'day' | 'time' | 'targetPeople' | 'title' | 'description' | 'openChatUrl' | 'agreement', string>>;

export const OPEN_CHAT_RE = /^https:\/\/open\.kakao\.com\/o\/[A-Za-z0-9_-]{4,40}$/;

export function toBody(d: Draft) {
  return {
    day: d.day,
    time: d.time,
    targetPeople: d.targetPeople,
    title: d.title,
    description: d.description,
    openChatUrl: d.openChatUrl.trim(),
    menuIds: d.menuIds,
    customMenus: d.customs.map((c) => ({
      vendorName: c.vendorName, name: c.name, price: c.price === '' ? null : Number(c.price), uploadId: c.uploadId,
    })),
  };
}

export function validateMenus(d: Draft, rules: Rules): FieldErrors {
  const n = d.menuIds.length + d.customs.length;
  if (n === 0) return { menus: '메뉴를 하나 이상 선택해 주세요.' };
  if (n > rules.menusMax) return { menus: `메뉴는 ${rules.menusMax}개까지 선택할 수 있어요.` };
  return {};
}

export function validateDetails(d: Draft, rules: Rules): FieldErrors {
  const e: FieldErrors = {};
  const hour = Number(d.time.slice(0, 2));
  if (!d.time) e.time = '모임 시간을 선택해 주세요.';
  else if (hour < rules.hourStart || hour >= rules.hourEnd) e.time = '모임 시간은 행사 운영 시간(오전 10시~밤 12시) 안에서 정해 주세요.';
  else if (toMeetupIso(d.day, d.time) <= new Date().toISOString()) e.time = '이미 지난 시간은 선택할 수 없어요.';
  if (!d.title.trim()) e.title = '제목을 입력해 주세요.';
  else if ([...d.title.trim()].length > rules.titleMax) e.title = `제목은 ${rules.titleMax}자 이내로 입력해 주세요.`;
  if (!d.description.trim()) e.description = '내용을 입력해 주세요.';
  else if ([...d.description.trim()].length > rules.descriptionMax) e.description = `내용은 ${rules.descriptionMax}자 이내로 입력해 주세요.`;
  if (!d.openChatUrl.trim()) e.openChatUrl = '오픈카톡 링크를 입력해 주세요.';
  else if (!OPEN_CHAT_RE.test(d.openChatUrl.trim())) e.openChatUrl = 'https://open.kakao.com/o/ 로 시작하는 오픈카톡 링크를 입력해 주세요.';
  return e;
}

/** 공식 메뉴 카탈로그 로딩 */
export function useCatalog() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.menus().then((r) => setVendors(r.vendors)).catch((e) => setError(e.message));
  }, []);
  return { vendors, error };
}

export function selectedRefs(d: Draft, vendors: Vendor[] | null, extra: MenuRef[]): MenuRef[] {
  const all = new Map<number, MenuRef>();
  vendors?.forEach((v) => v.menus.forEach((m) => all.set(m.id, m)));
  extra.forEach((m) => all.set(m.id, m));
  return d.menuIds.map((id) => all.get(id)).filter((m): m is MenuRef => !!m);
}

// ---------------- C1: 메뉴 선택 ----------------

export function MenuPicker({ draft, setDraft, vendors, extraMenus, rules, error }: {
  draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; vendors: Vendor[]; extraMenus: MenuRef[];
  rules: Rules; error?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [vendorIds, setVendorIds] = useState<number[]>([]);
  const count = draft.menuIds.length + draft.customs.length;
  const full = count >= rules.menusMax;
  const toggle = (id: number) =>
    setDraft((d) => ({ ...d, menuIds: d.menuIds.includes(id) ? d.menuIds.filter((x) => x !== id) : [...d.menuIds, id] }));
  const refs = selectedRefs(draft, vendors, extraMenus);
  const customRefs = extraMenus.filter((m) => !m.isOfficial && (matchesQuery(query, m.name) || matchesQuery(query, m.vendorName)));
  const shown = filterVendors(byVendor(vendors, vendorIds), query);

  return (
    <div>
      <p className="small muted" style={{ marginBottom: 10 }}>여러 업체의 메뉴를 함께 고를 수 있어요. (최대 {rules.menusMax}개)</p>
      {(refs.length > 0 || draft.customs.length > 0) && (
        <div className="selected-chips" style={{ marginBottom: 12 }}>
          {refs.map((m) => (
            <span key={m.id} className="selected-chip">
              {m.name}
              <button type="button" aria-label={`${m.name} 선택 해제`} onClick={() => toggle(m.id)}><IconClose size={14} /></button>
            </span>
          ))}
          {draft.customs.map((c) => (
            <span key={c.key} className="selected-chip">
              {c.name} <span style={{ opacity: 0.7 }}>(기타)</span>
              <button type="button" aria-label={`${c.name} 삭제`} onClick={() => setDraft((d) => ({ ...d, customs: d.customs.filter((x) => x.key !== c.key) }))}>
                <IconClose size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <div className="error-box" role="alert">{error}</div>}

      <SearchBox value={query} onChange={setQuery} />
      <VendorFilter vendors={vendors} selected={vendorIds} onChange={setVendorIds} />
      {query && shown.length === 0 && customRefs.length === 0 && (
        <div className="search-empty">'{query}'에 맞는 메뉴가 없어요. 아래에서 기타 메뉴로 직접 추가해 주세요.</div>
      )}

      {customRefs.length > 0 && (
        <section className="vendor">
          <div className="vendor-head"><h3>내가 추가한 기타 메뉴</h3></div>
          {customRefs.map((m) => (
            <PickRow key={m.id} m={m} checked={draft.menuIds.includes(m.id)} disabled={full && !draft.menuIds.includes(m.id)} onToggle={() => toggle(m.id)} />
          ))}
        </section>
      )}
      {shown.map((v) => (
        <section key={v.id} className="vendor" id={`pick-vendor-${v.id}`}>
          <div className="vendor-head"><h3>{v.name}</h3>{v.zone && <span>{v.zone}</span>}</div>
          <div style={{ padding: '0 4px 6px' }}>
            {v.menus.map((m) => (
              <PickRow key={m.id} m={m} checked={draft.menuIds.includes(m.id)} disabled={full && !draft.menuIds.includes(m.id)} onToggle={() => toggle(m.id)} />
            ))}
          </div>
        </section>
      ))}

      <button type="button" className="btn outline" disabled={full || draft.customs.length >= rules.customMenusMax} onClick={() => setCustomOpen(true)}>
        + 기타 메뉴 추가
      </button>
      <p className="small muted center" style={{ marginTop: 6 }}>목록에 없는 메뉴는 직접 추가할 수 있어요.</p>
      {customOpen && (
        <CustomMenuSheet
          onClose={() => setCustomOpen(false)}
          onAdd={(c) => {
            setDraft((d) => ({ ...d, customs: [...d.customs, c] }));
            setCustomOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PickRow({ m, checked, disabled, onToggle }: { m: MenuRef; checked: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="pick-row" disabled={disabled} onClick={onToggle}>
      <span className="pick-box">{checked && <IconCheck />}</span>
      <Thumb src={m.image} size={48} />
      <span className="grow">
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{m.name}</span>
        {m.price != null && <span className="small muted">{won(m.price)}</span>}
      </span>
    </button>
  );
}

// ---------------- C2: 기타 메뉴 ----------------

function CustomMenuSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (c: CustomDraft) => void }) {
  const { handleAuthError } = useApp();
  const [vendorName, setVendorName] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [upload, setUpload] = useState<{ id: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setErr('사진은 8MB 이하로 올려 주세요.');
    setErr(null);
    setUploading(true);
    try {
      setUpload(await api.upload(file));
    } catch (e) {
      if (!handleAuthError(e)) setErr((e as ApiError).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!vendorName.trim() || !name.trim()) return setErr('업체명과 메뉴명을 입력해 주세요.');
    if (price && !/^\d{1,7}$/.test(price)) return setErr('가격은 숫자만 입력해 주세요.');
    onAdd({
      key: crypto.randomUUID?.() ?? String(Date.now()),
      vendorName: vendorName.trim(), name: name.trim(), price, uploadId: upload?.id ?? null, imageUrl: upload?.url ?? null,
    });
  };

  return (
    <Sheet onClose={onClose} label="기타 메뉴 추가">
      <h2>기타 메뉴 추가</h2>
      <div className="field">
        <label htmlFor="c-vendor">업체명<span className="req">*</span></label>
        <input id="c-vendor" className="input" maxLength={30} value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="업체명을 입력해 주세요." />
      </div>
      <div className="field">
        <label htmlFor="c-name">메뉴 이름<span className="req">*</span></label>
        <input id="c-name" className="input" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="메뉴 이름을 입력해 주세요." />
      </div>
      <div className="field">
        <label htmlFor="c-price">가격<span className="opt">(선택)</span></label>
        <input id="c-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="숫자만 입력 (원)" />
      </div>
      <div className="field">
        <span className="label">메뉴 사진<span className="opt">(선택)</span></span>
        <label className="upload-box">
          {upload ? <img src={upload.url} alt="올린 메뉴 사진" /> : (
            <span><IconImage /><br />{uploading ? '올리는 중…' : '사진을 선택해 주세요.'}</span>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={(e) => pick(e.target.files?.[0])} aria-label="메뉴 사진 선택" />
        </label>
        <span className="hint">직접 찍은 사진만 올려 주세요. 사진이 없으면 기본 이미지 없이 표시돼요.</span>
      </div>
      {err && <div className="error-box" role="alert">{err}</div>}
      <button type="button" className="btn primary" onClick={submit} disabled={uploading}>메뉴 추가하기</button>
    </Sheet>
  );
}

// ---------------- C3: 내용 입력 ----------------

export function DetailsForm({ draft, setDraft, rules, days, errors }: {
  draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; rules: Rules;
  days: { date: string; label: string }[]; errors: FieldErrors;
}) {
  const [hh, mm] = draft.time ? draft.time.split(':') : ['', ''];
  const setTime = (h: string, m: string) => setDraft((d) => ({ ...d, time: h && m ? `${h}:${m}` : h ? `${h}:${m || '00'}` : '' }));
  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  // 시간이 비어 있으면 지금 이후 가장 가까운 운영 시간으로 채운다
  useEffect(() => {
    if (!draft.time) {
      const t = nearestSlot(draft.day, rules);
      if (t) setDraft((d) => (d.time ? d : { ...d, time: t }));
    }
  }, [draft.day, draft.time, rules, setDraft]);
  // 날짜를 바꿨는데 고른 시간이 그날엔 이미 지났다면 그날의 가장 가까운 시간으로 옮긴다
  const pickDay = (day: string) =>
    setDraft((d) => {
      const stale = !d.time || toMeetupIso(day, d.time) <= new Date().toISOString();
      return { ...d, day, time: stale ? nearestSlot(day, rules) : d.time };
    });
  const minutes = Array.from({ length: 60 / rules.minuteStep }, (_, i) => String(i * rules.minuteStep).padStart(2, '0'));
  const hours = Array.from({ length: rules.hourEnd - rules.hourStart }, (_, i) => String(rules.hourStart + i).padStart(2, '0'));

  return (
    <div>
      <div className="field">
        <span className="label">언제 드실래요?<span className="req">*</span></span>
        <div className="days" style={{ margin: 0 }}>
          {days.map((d) => (
            <button key={d.date} type="button" aria-pressed={draft.day === d.date} onClick={() => pickDay(d.date)}>{d.label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label" id="time-label">모임 시간<span className="req">*</span></span>
        <div className="row" role="group" aria-labelledby="time-label">
          <select className="select" aria-label="시" value={hh} aria-invalid={!!errors.time} onChange={(e) => setTime(e.target.value, mm)}>
            <option value="">시</option>
            {hours.map((h) => <option key={h} value={h}>{h}시</option>)}
          </select>
          <select className="select" aria-label="분" value={mm} aria-invalid={!!errors.time} onChange={(e) => setTime(hh || '12', e.target.value)}>
            <option value="">분</option>
            {minutes.map((m) => <option key={m} value={m}>{m}분</option>)}
          </select>
        </div>
        {errors.time ? <span className="err">{errors.time}</span> : <span className="hint">행사 운영 시간 오전 10시~밤 12시 안에서 골라 주세요.</span>}
      </div>
      <div className="field">
        <span className="label">희망 인원<span className="req">*</span></span>
        <div className="stepper">
          <button type="button" aria-label="인원 줄이기" disabled={draft.targetPeople <= rules.peopleMin} onClick={() => set('targetPeople')(draft.targetPeople - 1)}>−</button>
          <span aria-live="polite">{draft.targetPeople}명</span>
          <button type="button" aria-label="인원 늘리기" disabled={draft.targetPeople >= rules.peopleMax} onClick={() => set('targetPeople')(draft.targetPeople + 1)}>+</button>
        </div>
        <span className="hint">본인을 포함한 희망 인원이에요. 실제 참여 인원은 오픈카톡에서 확인해 주세요.</span>
        {errors.targetPeople && <span className="err">{errors.targetPeople}</span>}
      </div>
      <div className="field">
        <label htmlFor="f-title">제목<span className="req">*</span></label>
        <input id="f-title" className="input" value={draft.title} maxLength={rules.titleMax + 10} aria-invalid={!!errors.title}
          onChange={(e) => set('title')(e.target.value)} placeholder="예) 삼진어묵한상 같이 드실 분" />
        <div className="counter">{[...draft.title].length}/{rules.titleMax}</div>
        {errors.title && <span className="err">{errors.title}</span>}
      </div>
      <div className="field">
        <label htmlFor="f-desc">내용<span className="req">*</span></label>
        <textarea id="f-desc" className="textarea" value={draft.description} aria-invalid={!!errors.description}
          onChange={(e) => set('description')(e.target.value)} placeholder="어떤 분과 어떻게 나눠 먹고 싶은지 적어 주세요. 만날 장소는 오픈카톡에서 정해 주세요." />
        <div className="counter">{[...draft.description].length}/{rules.descriptionMax}</div>
        {errors.description && <span className="err">{errors.description}</span>}
      </div>
      <div className="field">
        <label htmlFor="f-url">오픈카톡 링크<span className="req">*</span></label>
        <input id="f-url" className="input" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" value={draft.openChatUrl}
          aria-invalid={!!errors.openChatUrl} onChange={(e) => set('openChatUrl')(e.target.value)} placeholder="https://open.kakao.com/o/..." />
        <span className="hint">이 모집글 전용 오픈채팅방 링크를 넣어 주세요. 로그인한 이용자에게만 보여요.</span>
        {errors.openChatUrl && <span className="err">{errors.openChatUrl}</span>}
      </div>
    </div>
  );
}

export function mapServerErrors(e: unknown): FieldErrors | null {
  if (e instanceof ApiError && e.code === 'VALIDATION') return e.fieldErrors as FieldErrors;
  return null;
}

export function CatalogGate({ children }: { children: (vendors: Vendor[]) => React.ReactNode }) {
  const { vendors, error } = useCatalog();
  if (error) return <div className="error-box">{error}</div>;
  if (!vendors) return <Spinner />;
  return <>{children(vendors)}</>;
}
