// 하위 화면 공통 조각: 화면 틀(상단 바 + 제목), 카드, 표, 상태 칩, 빈 문구. 전광판은 개요에만 있다.
import React from 'react';
import { TopBar } from '../components/panels.jsx';
import { StepMark, Tag } from '../components/primitives.jsx';
import { STATUS, ROADMAP_TAG, roadmapWord, kst } from '../lib/format.js';

export { kst };

/** 화면 루트. screen은 판정 표식(data-screen), nav는 선택할 내비 순번, ov는 overview.json(상단 바 자료). */
export function Screen({ ov, screen, nav, title, sub, children }) {
  return (
    <div className="screen" data-screen={screen}>
      <TopBar project={ov.project} signals={ov.signals} generatedAt={ov.generatedAt} current={nav} />
      <main className="page">
        <div className="page-hd"><h1>{title}</h1>{sub != null && <span className="sub">{sub}</span>}</div>
        {children}
      </main>
    </div>
  );
}

/** 카드. id는 경로 이동 뒤 스크롤·강조 대상(예: rm-<id>). */
export function Card({ id, title, sub, className = '', children }) {
  return (
    <section id={id} className={className ? `card ${className}` : 'card'}>
      {title != null && <div className="card-hd"><h2>{title}</h2>{sub != null && <span className="sub">{sub}</span>}</div>}
      {children}
    </section>
  );
}

/** 가로 스크롤 표 상자. head는 머리 칸 글자 목록. */
export function Table({ head, children }) {
  return (
    <div className="tbl">
      <table>
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const EXTRA = { mixed: '혼합', static: '정적', missing: '라우트 없음' };
/** 단계·화면 상태 칩: 상태 모양 표식 + 짧은 이름. */
export function StatusChip({ status }) {
  const known = STATUS[status];
  return (
    <span className={`schip s-${status}`}>
      {known && <StepMark status={status === 'mixed' ? 'partial' : status} />}
      {known ? known.word : EXTRA[status] ?? status}
    </span>
  );
}

/** 로드맵 항목·마일스톤 상태 태그("진행"은 "진행 중"). */
export const RoadmapTag = ({ status }) => <Tag kind={ROADMAP_TAG[status] || 'planned'}>{roadmapWord(status || '상태 없음')}</Tag>;

/** 빈 문구 한 줄. */
export const Empty = ({ children }) => <p className="empty">{children}</p>;
