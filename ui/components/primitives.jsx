// 작은 표식 컴포넌트: 패널 틀, 칩, 태그, 알약, 점.
import React from 'react';

/** 패널 틀. 머리줄(아이콘·제목·보조 문구·기준 시각)과 본문. */
export function Panel({ icon, title, sub, at, badge, more, budget, children, className = "" }) {
  return (
    <section className={className ? `panel ${className}` : 'panel'} data-budget={budget}>
      <div className="ph">
        {icon}
        <h2>{title}</h2>
        {badge}
        {sub != null && <span className="sub">{sub}</span>}
        {at && <span className="at">{at}</span>}
        {more && <a className="more" href={more.href}>외 {more.n} →</a>}
      </div>
      {children}
    </section>
  );
}

/** 프로젝트가 작성한 문구(기능·단계·로드맵·작업 이름 등). 판정의 내부 용어 검사에서 빠진다. */
export function Proj({ children }) {
  return children == null || children === '' ? null : <span data-text="project">{children}</span>;
}

/** 누를 수 있는 필터 칩. `on`이면 강조한다. */
export function Chip({ on = false, count, onClick, children }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag className={`chip ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={onClick ? on : undefined}>
      {children}
      {count != null && <span className="n">{count}</span>}
    </Tag>
  );
}

/** 짧은 상태 태그. `kind`는 live·mock·planned·next 또는 완료·진행·다음·대기·이후·기능·수정·화면·배포·문서·검사. */
export function Tag({ kind, children }) {
  return <span className={`tag t-${kind}`}>{children}</span>;
}

/** 상단 바 알약. tone: good | warn | plain */
export function Pill({ tone = 'plain', href, className = '', children }) {
  const cls = ['pill', tone === 'plain' ? '' : tone, className].filter(Boolean).join(' ');
  return href
    ? <a className={cls} href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span className={cls}>{children}</span>;
}

/** 색 점. pulse면 맥박 애니메이션. */
export function Dot({ color, pulse = false }) {
  return <span className={`dot ${pulse ? 'pulse' : ''}`} style={color ? { color } : undefined} />;
}

export const Icons = {
  list: <svg width="15" height="15" viewBox="0 0 16 16"><path d="M2 3h12M2 8h12M2 13h8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>,
  gauge: <svg width="15" height="15" viewBox="0 0 16 16"><path d="M2 12a6 6 0 1 1 12 0" stroke="currentColor" strokeWidth="1.6" fill="none" /><path d="M8 12l3-4" stroke="currentColor" strokeWidth="1.6" /></svg>,
  clock: <svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 2v5l3 2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>,
  map: <svg width="15" height="15" viewBox="0 0 16 16"><path d="M1.5 4l4-2 5 2 4-2v10l-4 2-5-2-4 2z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" /></svg>,
  trend: <svg width="15" height="15" viewBox="0 0 16 16"><path d="M1.5 12l4-5 3 3 6-7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  alert: <svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 1.5l6.5 12h-13z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" /><path d="M8 6v3.5M8 11.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  screen: <svg width="15" height="15" viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M6.5 6v4l3.5-2z" fill="currentColor" /></svg>,
  table: <svg width="15" height="15" viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" /></svg>,
};

/** 단계 상태 모양 표식(12px): 동작 채운 원, 목업 반 채움, 계획 실선 빈 원, 구상 점선 빈 원. 기능 상태 partial은 초록 반 채움. */
export function StepMark({ status, size = 12 }) {
  const r = size / 2 - 1.5, c = size / 2;
  const color = { live: 'var(--green)', mock: 'var(--amber)', planned: 'var(--plan)', next: 'var(--violet)', partial: 'var(--green)' }[status] || 'var(--muted)';
  return (
    <svg className="stepmark" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {status === 'live' && <circle cx={c} cy={c} r={r + 0.75} fill={color} />}
      {(status === 'mock' || status === 'partial') && <><circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" /><path d={`M${c} ${c - r}A${r} ${r} 0 0 0 ${c} ${c + r}Z`} fill={color} /></>}
      {status === 'planned' && <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" />}
      {status === 'next' && <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2.5 2" />}
    </svg>
  );
}
