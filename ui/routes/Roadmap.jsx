// 로드맵 화면(#/roadmap, #/roadmap/<항목 또는 마일스톤 id>).
// 1.0.1 site/map.js의 roadmapView()를 이식한다. 1.1.0은 마일스톤별 <details> 묶음, 완료일·결정 대기 주체·경과일·막힘 표시, 상태 필터 칩을 더한다.
// 어휘는 "장면"→"단계"로 바꾸고 파일 경로 문구는 data.sources에서 읽는다.
// 1.3.0은 카드 목록 위에 기술 트리 패널과 고른 항목 상세 슬롯을 두고, 카드에 층·잠김 칩, 후속 줄, 연결 단계를 함께 가리키는 항목을 더한다.
import React from 'react';
import { Screen, Empty, RoadmapTag } from './common.jsx';
import { StepMark, Proj, Chip } from '../components/primitives.jsx';
import { RoadmapTree } from '../components/RoadmapTree.jsx';
import { STATUS, mdKo, waitDays } from '../lib/format.js';
import { buildTree } from '../lib/tree.js';

const DONE = '완료';
const STATUS_SEQ = ['완료', '진행', '다음', '대기', '이후'];
const BLOCK_WORD = { waiting: '결정 대기', deps: '선행 미완', task: '작업 대기' };

/** 1.0.1 md(): **굵게**, `코드`, [글자](주소)는 글자만. 프로젝트 문구라 data-text="project"로 감싼다. */
function Md({ text }) {
  if (!text) return null;
  const out = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\[([^\]]+)\]\([^)]+\)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) out.push(<b key={k++}>{m[1]}</b>);
    else if (m[2] != null) out.push(<code key={k++}>{m[2]}</code>);
    else out.push(m[3]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <span data-text="project">{out}</span>;
}

/** 결정 대기: 주체 태그 + 질문 + "{n}일째". 1.1.0 필드가 없는 자료는 waitingOn 원문. */
function Waiting({ who, what, raw, since, refIso }) {
  const days = since && refIso ? waitDays(since, refIso) : null;
  return (
    <>
      {who && <span className="rm-who"><Proj>{who}</Proj></span>}
      <Md text={who ? what : what || raw} />
      {days != null && <span className="rm-days">{days}일째</span>}
    </>
  );
}

/** 연결 단계 칩: 상태 표식 + 단계 이름, 기능 단계 화면으로. 없는 단계는 경고 글자.
 *  also: 같은 단계를 함께 가리키는 다른 항목들. 칩 제목에 수를, 칩 아래에 그 항목 링크를 단다. */
function StepLink({ s, also = [] }) {
  if (s.missing) return <span className="rm-miss">단계 없음 {s.ref}</span>;
  const title = `${s.label} · ${STATUS[s.status]?.word || s.status}${s.fixed ? ' · 하드코딩 표시값' : ''}${also.length ? ` · 이 단계를 함께 가리키는 항목 ${also.length}` : ''}`;
  const chip = (
    <a className="rm-step" href={`#/journeys/${encodeURIComponent(s.journey)}/${encodeURIComponent(s.step)}`} title={title}>
      <StepMark status={s.status} size={10} /><Proj>{s.label}</Proj>
      {s.fixed && <span className="rm-fixed">고정값</span>}
    </a>
  );
  if (!also.length) return chip;
  return (
    <span className="rm-stepw">
      {chip}
      <span className="rm-also">함께 가리키는 항목 {also.length} · {also.map((x, i) => (
        <React.Fragment key={x.id}>{i > 0 && ', '}<a href={`#/roadmap/${encodeURIComponent(x.id)}`}><Proj>{x.title}</Proj></a></React.Fragment>
      ))}</span>
    </span>
  );
}

/** 추적 작업 한 줄: 작업 화면 링크 + 단계 · 계획 항목. 없는 폴더는 경고 글자. */
function TaskLine({ t }) {
  if (t.missing) return <div className="rm-miss">작업 폴더 없음 {t.name}</div>;
  const total = (t.pnDone || 0) + (t.pnOpen || 0);
  return (
    <div>
      <a href={`#/tasks/${encodeURIComponent(t.name)}`}><Proj>{t.title}</Proj></a>
      <span className="rm-dim"> <Proj>{t.stage}</Proj>{total ? ` · 계획 항목 ${t.pnDone}/${total}` : ''}</span>
    </div>
  );
}

/** 항목 카드. 1.0.1 .rm-item 구성에 완료일·결정 대기 주체·경과일·막힘을 더한다.
 *  1.3.0: node(buildTree 노드)로 층·잠김 칩과 후속 줄, sharedBy(단계 ref → 항목들)로 함께 가리키는 항목을 더한다. */
function ItemCard({ m, selected, refIso, node, byId, sharedBy }) {
  const p = m.progress || { live: 0, total: 0, fixed: 0 };
  const blocked = (m.blockedBy || []).filter((b) => BLOCK_WORD[b]);
  const waiting = m.waitingOn || m.waitingWhat;
  const cls = ['rm-item', selected ? 'on' : '', m.status === DONE ? 'is-done' : ''].filter(Boolean).join(' ');
  return (
    <article className={cls} id={`rm-${m.id}`}>
      <div className="rm-num">{m.order}</div>
      <div className="rm-body">
        <div className="rm-h">
          <h3><Proj>{m.title}</Proj></h3>
          <RoadmapTag status={m.status} />
          <span className="chip">{m.mode ? <Proj>{m.mode}</Proj> : '진행 방식 없음'}</span>
          {node && <span className="chip rm-layer" title="선행 깊이">{node.depth == null ? '순환' : `${node.depth + 1}층`}</span>}
          {node?.locked && <span className="chip rm-lock" title={`선행이 안 끝남: ${node.blockedByDeps.map((id) => byId.get(id)?.title || id).join(', ')}`}>잠김</span>}
          <span className="rm-dim">동작 단계 {p.live}/{p.total}{p.fixed ? ` · 하드코딩 표시 단계 ${p.fixed}` : ''}</span>
          {m.completedAt && <span className="rm-date">{mdKo(m.completedAt)} 완료</span>}
          {blocked.length > 0 && <span className="rm-block" title="막힌 이유">막힘 · {blocked.map((b) => BLOCK_WORD[b]).join(' · ')}</span>}
        </div>
        {m.goal && <p className="rm-goal"><Md text={m.goal} /></p>}
        {m.problems?.length > 0 && (
          <p className="rm-warn">{m.problems.map((x, i) => <React.Fragment key={i}>{i > 0 && <br />}{x.replace(/^장면 없음/, '단계 없음')}</React.Fragment>)}</p>
        )}
        <dl className="rm-kv">
          {waiting && <><dt>결정 대기</dt><dd className="rm-wait"><Waiting who={m.waitingWho} what={m.waitingWhat} raw={m.waitingOn} since={m.waitingSince} refIso={refIso} /></dd></>}
          {m.done && <><dt>완료 기준</dt><dd><Md text={m.done} /></dd></>}
          {m.deps?.length > 0 && (
            <><dt>선행</dt><dd className="rm-deps">{m.deps.map((x) => (
              <span key={x.id}>{x.status ? <a href={`#/roadmap/${encodeURIComponent(x.id)}`}><Proj>{x.title}</Proj></a> : <Proj>{x.title}</Proj>}{x.status && <> <RoadmapTag status={x.status} /></>}</span>
            ))}</dd></>
          )}
          {node?.children.length > 0 && (
            <><dt>후속</dt><dd className="rm-deps">{node.children.map((id) => { const c = byId.get(id); return (
              <span key={id}><a href={`#/roadmap/${encodeURIComponent(id)}`}><Proj>{c.title}</Proj></a> <RoadmapTag status={c.status} /></span>
            ); })}</dd></>
          )}
          <dt>작업</dt>
          <dd>{m.tasks?.length ? m.tasks.map((t) => <TaskLine key={t.name} t={t} />) : <span className="rm-dim">착수 전</span>}</dd>
          <dt>연결 단계</dt>
          <dd className="rm-steps">{m.scenes?.length ? m.scenes.map((s, i) => <StepLink key={s.ref || i} s={s} also={(sharedBy?.get(s.ref) || []).filter((x) => x.id !== m.id)} />) : <span className="rm-dim">연결된 단계 없음</span>}</dd>
        </dl>
      </div>
    </article>
  );
}

/** 마일스톤 묶음. 완료는 요약 줄 "{제목} · 항목 {n} · {M월 D일} 완료"만, 나머지는 태그·진척·목표일과 목표·결정 대기. */
function MilestoneGroup({ ms, items, open, refIso, children }) {
  const done = ms.status === DONE;
  const prog = ms.progress || ms.steps;
  const target = !done && ms.targetOn ? (waitDays(ms.targetOn, refIso) > 1 ? `목표 지남 ${waitDays(ms.targetOn, refIso) - 1}일` : `목표 ${mdKo(ms.targetOn)}`) : null;
  const hasWait = ms.waitingOn || ms.waitingWhat;
  return (
    <details className={`rm-ms${done ? ' is-done' : ''}`} id={`rm-${ms.id}`} open={open}>
      <summary>
        {done ? (
          <span className="rm-ms-t"><Proj>{ms.title}</Proj> · 항목 {items} · {ms.completedOn ? `${mdKo(ms.completedOn)} 완료` : '완료'}</span>
        ) : (
          <>
            <RoadmapTag status={ms.status} />
            <span className="rm-ms-t"><Proj>{ms.title}</Proj></span>
            <span className="rm-dim">항목 {items}</span>
            {prog?.total ? <span className="rm-dim">단계 {prog.live}/{prog.total}</span> : ms.plans?.total ? <span className="rm-dim">계획 항목 {ms.plans.done}/{ms.plans.total}</span> : null}
            {target && <span className="rm-dim">{target}</span>}
            {ms.blocked && <span className="rm-block">막힘</span>}
          </>
        )}
      </summary>
      {!done && (ms.goal || hasWait) && (
        <div className="rm-ms-hd">
          {ms.goal && <p className="rm-goal"><Md text={ms.goal} /></p>}
          {hasWait && <p className="rm-wait"><span className="rm-dim">결정 대기 </span><Waiting who={ms.waitingWho} what={ms.waitingWhat} raw={ms.waitingOn} since={ms.waitingSince} refIso={refIso} /></p>}
        </div>
      )}
      {children}
    </details>
  );
}

/** ov: overview.json, data: data.json, params: parseRoute 결과의 params({id}) */
export function Roadmap({ ov, data, params }) {
  const R = data.roadmap || [];
  const MS = [...(data.milestones || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sel = params.id || null;
  const refIso = data.generatedAt || ov.generatedAt;
  const [filter, setFilter] = React.useState('전체');
  const tree = React.useMemo(() => buildTree(R, MS), [data]);
  const byId = React.useMemo(() => new Map(R.map((m) => [m.id, m])), [data]);
  // 단계 ref → 그 단계를 가리키는 항목들(카드의 「함께 가리키는 항목」)
  const sharedBy = React.useMemo(() => {
    const map = new Map();
    for (const m of R) for (const s of m.scenes || []) if (!s.missing) { if (!map.has(s.ref)) map.set(s.ref, []); if (!map.get(s.ref).includes(m)) map.get(s.ref).push(m); }
    return map;
  }, [data]);

  const doneItems = R.filter((m) => m.status === DONE).length;
  const sub = MS.length
    ? `마일스톤 ${MS.filter((m) => m.status === DONE).length}/${MS.length} 완료 · 항목 ${doneItems}/${R.length} 완료. 위에서부터 차례로 한다`
    : `완료 ${doneItems}/${R.length}. 위에서부터 차례로 한다`;

  if (!R.length) {
    return (
      <Screen ov={ov} screen="roadmap" nav={3} title="로드맵">
        <Empty>로드맵 파일이 없거나 항목이 없습니다.</Empty>
      </Screen>
    );
  }

  const counts = R.reduce((a, m) => ({ ...a, [m.status]: (a[m.status] || 0) + 1 }), {});
  const keys = [...STATUS_SEQ.filter((k) => counts[k]), ...Object.keys(counts).filter((k) => !STATUS_SEQ.includes(k))];
  // 고른 항목은 트리 바로 아래 상세 슬롯에서만 렌더하고 목록에서 뺀다(id="rm-<id>"가 문서에 하나, DEC-19).
  const selItem = sel ? byId.get(sel) : null;
  const passes = (m) => filter === '전체' || m.status === filter;
  const visible = (m) => passes(m) && m.id !== sel;
  const card = (m) => <ItemCard key={m.id} m={m} selected={sel === m.id} refIso={refIso} node={tree.nodes[m.id]} byId={byId} sharedBy={sharedBy} />;

  let body;
  if (!MS.length) {
    body = <div className="rm">{R.filter(visible).map(card)}</div>;
  } else {
    const known = new Set(MS.map((x) => x.id));
    const groups = [
      ...MS.map((ms) => ({ ms, items: R.filter((m) => m.milestone === ms.id) })),
      { ms: null, items: R.filter((m) => !m.milestone || !known.has(m.milestone)) },
    ];
    body = groups.map(({ ms, items }) => {
      const shown = items.filter(visible);
      if (!ms) {
        if (!items.length || (!shown.length && !items.includes(selItem))) return null;
        return (
          <details className="rm-ms" key="-none" open>
            <summary><span className="rm-ms-t">마일스톤 없음</span><span className="rm-dim">항목 {items.length}</span></summary>
            {shown.length ? <div className="rm">{shown.map(card)}</div> : <Empty>고른 항목은 위 상세에 있다</Empty>}
          </details>
        );
      }
      if (filter !== '전체' && !shown.length && sel !== ms.id) return null;
      const open = ms.status !== DONE || sel === ms.id || items.some((m) => m.id === sel);
      return (
        <MilestoneGroup key={ms.id} ms={ms} items={items.length} open={open} refIso={refIso}>
          {shown.length ? <div className="rm">{shown.map(card)}</div> : <Empty>{items.includes(selItem) ? '고른 항목은 위 상세에 있다' : filter === '전체' ? '묶인 항목 없음' : '고른 상태의 항목 없음'}</Empty>}
        </MilestoneGroup>
      );
    });
  }

  const src = data.sources || {};
  const foot = [src.roadmap && `정본 ${src.roadmap}`, src.semantic && `단계 상태는 ${src.semantic}`].filter(Boolean).join(' · ');

  return (
    <Screen ov={ov} screen="roadmap" nav={3} title="로드맵" sub={sub}>
      <div className="chips rm-filter">
        {['전체', ...keys].map((k) => (
          <Chip key={k} on={filter === k} count={k === '전체' ? R.length : counts[k]} onClick={() => setFilter(k)}>{k === '진행' ? '진행 중' : k}</Chip>
        ))}
      </div>
      <RoadmapTree tree={tree} items={R} milestones={MS} sel={sel} faded={(id) => !passes(byId.get(id))} refIso={refIso} />
      {selItem && <div className="rt-detail">{card(selItem)}</div>}
      {body}
      {foot && <p className="src rm-src">{foot}</p>}
    </Screen>
  );
}
