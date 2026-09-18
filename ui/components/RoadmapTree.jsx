// 로드맵 기술 트리: 항목을 노드, 선행을 선으로 그린다. 배치는 ui/lib/tree.js(buildTree·pathOf·geometry)가 계산하고 여기서는 DOM에 붙이기만 한다.
// SVG에는 선만 넣고(aria-hidden) 글자는 절대 위치 HTML 노드로 겹친다. 좌표·크기는 React style prop으로만 준다(CSP style-src 'self').
import React from 'react';
import { pathOf, geometry } from '../lib/tree.js';
import { Panel, Proj } from './primitives.jsx';
import { RoadmapTag } from '../routes/common.jsx';
import { mdKo, waitDays, roadmapWord } from '../lib/format.js';

const DONE = '완료';
const TICK_MAX = 8;
const HEAD = { layer: 30, milestone: 46 }; // 열 머리 높이
const BLOCK_WORD = { waiting: '결정 대기', deps: '선행 미완', task: '작업 대기' };

function useWidth(ref) {
  const [w, setW] = React.useState(1000);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    setW(Math.round(el.clientWidth));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** 목표일 문구: 지났으면 "목표 지남 n일", 아니면 "목표 M월 D일". 완료 마일스톤은 없음. */
export function targetWord(ms, refIso) {
  if (!ms || ms.status === DONE || !ms.targetOn) return null;
  const d = waitDays(ms.targetOn, refIso);
  return d > 1 ? `목표 지남 ${d - 1}일` : `목표 ${mdKo(ms.targetOn)}`;
}

/** 노드 접근 가능한 이름: {제목}, {상태 또는 잠김}, {진행 방식}, 단계 {n}[, 선행 {제목들}] */
export function nodeLabel(m, n, titleOf) {
  const parts = [m.title, n.locked ? '잠김' : roadmapWord(m.status || '상태 없음'), m.mode || '진행 방식 없음', `단계 ${(m.scenes || []).length}`];
  if (n.locked) parts.push(`선행 ${n.blockedByDeps.map(titleOf).join(', ')}`);
  return parts.join(', ');
}

/** 열 머리(<h3>). milestone 모드는 마일스톤 제목·완료/전체·상태 태그·목표일, layer 모드는 상태 요약 한 줄. */
export function TreeColumnHead({ col, ms, refIso, on, h }) {
  const cls = `rt-head${on ? ' on' : ''}`, st = { height: h };
  if (col.kind === 'milestone' && ms) {
    const done = col.counts[DONE] || 0;
    const target = targetWord(ms, refIso);
    return (
      <h3 className={cls} style={st}>
        <span className="rt-head-t"><Proj>{ms.title}</Proj></span>
        <span className="rt-head-m">
          {col.ids.length ? <span>{done}/{col.ids.length}</span> : <span>묶인 항목 없음</span>}
          <RoadmapTag status={ms.status} />
          {target && <span>{target}</span>}
        </span>
      </h3>
    );
  }
  if (col.kind === 'unassigned') {
    return <h3 className={cls} style={st}><span className="rt-head-t">마일스톤 없음</span><span className="rt-head-m"><span>{col.counts[DONE] || 0}/{col.ids.length}</span></span></h3>;
  }
  if (col.kind === 'cycle') return <h3 className={cls} style={st}><span className="rt-head-t">순환</span><span className="rt-head-m">{col.label}</span></h3>;
  return <h3 className={cls} style={st}>{col.label || '항목 없음'}</h3>;
}

/** 연결 단계 눈금: 단계마다 하나, 색은 단계의 현재 상태. 깨진 참조는 빨간 고리. 8개를 넘으면 8개와 "+n". */
function Ticks({ scenes }) {
  if (!scenes?.length) return null;
  const shown = scenes.slice(0, TICK_MAX);
  return (
    <span className="rt-ticks" aria-hidden="true">
      {shown.map((s, i) => <span key={i} className={`rt-tick ${s.missing ? 'is-miss' : `s-${s.status}`}`} />)}
      {scenes.length > TICK_MAX && <span className="rt-more">+{scenes.length - TICK_MAX}</span>}
    </span>
  );
}

/** 노드: <a href="#/roadmap/<id>">. 제목 두 줄, 메타 줄, 연결 단계 눈금, 오른쪽 위 완료일 또는 막힘. */
export function TreeNode({ m, n, x, y, w, h, cls, titleOf, onKeyDown }) {
  const blocked = (m.blockedBy || []).filter((b) => BLOCK_WORD[b]);
  const label = nodeLabel(m, n, titleOf);
  const lockTitle = n.locked ? `잠김 · 선행 ${n.blockedByDeps.map(titleOf).join(', ')}` : undefined;
  const state = m.status === DONE ? 'is-done' : m.status === '진행' ? 'is-doing' : n.locked ? 'is-locked' : '';
  return (
    <li>
      <a className={['rt-node', state, cls].filter(Boolean).join(' ')} href={`#/roadmap/${encodeURIComponent(m.id)}`} data-id={m.id}
        aria-label={label} title={lockTitle} style={{ left: x, top: y, width: w, height: h }} onKeyDown={onKeyDown}>
        <span className="rt-top">
          <span className="rt-t"><Proj>{m.title}</Proj></span>
          {m.completedAt ? <span className="rt-date">{mdKo(m.completedAt)}</span> : blocked.length > 0 ? <span className="rt-block" title={blocked.map((b) => BLOCK_WORD[b]).join(' · ')}>막힘</span> : null}
        </span>
        <span className="rt-m">
          {n.locked
            ? <>잠김 · 선행 <Proj>{titleOf(n.blockedByDeps[0])}</Proj></>
            : <>{roadmapWord(m.status || '상태 없음')} · {m.mode ? <Proj>{m.mode}</Proj> : '진행 방식 없음'}</>}
        </span>
        <Ticks scenes={m.scenes} />
      </a>
    </li>
  );
}

// 노드 왼쪽·오른쪽 가운데와, 열 안 우회 엣지가 나가고 들어오는 높이(나가는 선은 아래쪽, 들어오는 선은 위쪽에 붙여 겹치지 않게 한다)
const midY = (g, row) => g.padTop + row * (g.nodeH + g.gapY) + g.nodeH / 2;
const curve = (x1, y1, x2, y2) => { const dx = (x2 - x1) / 2; return `C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`; };

/** 엣지 하나의 SVG 경로. 긴 엣지는 더미 꺾임점을 지나고, 같은 열 안 엣지는 열 왼쪽 차선으로 우회한다. */
export function edgePath(e, tree, g) {
  const at = (id) => tree.nodes[id] || tree.dummies[id];
  const a = tree.nodes[e.from], b = tree.nodes[e.to];
  if (e.sameColumn) {
    const x = g.colX[a.column], lx = x - 8 * (e.lane + 1);
    const y1 = midY(g, a.row) + g.nodeH * 0.15, y2 = midY(g, b.row) - g.nodeH * 0.15;
    return `M${x} ${y1}H${lx}V${y2}H${x}`;
  }
  if (e.backward) return `M${g.colX[a.column]} ${midY(g, a.row)}${curve(g.colX[a.column], midY(g, a.row), g.colX[b.column] + g.nodeW, midY(g, b.row))}`;
  let x = g.colX[a.column] + g.nodeW, y = midY(g, a.row);
  let d = `M${x} ${y}`;
  for (const v of e.via) {
    const p = at(v), px = g.colX[p.column], py = midY(g, p.row);
    d += `${curve(x, y, px, py)}H${px + g.nodeW}`;
    x = px + g.nodeW; y = py;
  }
  return d + curve(x, y, g.colX[b.column], midY(g, b.row));
}

/** SVG 선만. 기본 --plan, 고른 길 .on --cyan, 순환 점선, 역행 --amber 점선, 흐린 선은 --dim까지만. 화살촉 없음. */
export function TreeEdges({ tree, g, path, top }) {
  const picked = path.nodes.size > 0;
  return (
    <svg className="rt-edges" aria-hidden="true" width={g.W} height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} style={{ top }}>
      {tree.edges.map((e) => {
        const cls = ['rt-edge rt-line', e.cyclic && 'is-cyc', e.backward && 'is-back', picked && (path.edges.has(e.id) ? 'on' : 'dim')].filter(Boolean).join(' ');
        return <path key={e.id} className={cls} data-edge={e.id} d={edgePath(e, tree, g)} />;
      })}
    </svg>
  );
}

/** 이웃으로 초점 옮기기: ←첫 선행, →첫 후속, ↑·↓같은 열 이웃. */
function neighbour(tree, id, key) {
  const n = tree.nodes[id];
  if (key === 'ArrowLeft') return n.parents[0];
  if (key === 'ArrowRight') return n.children[0];
  const ids = tree.columns[n.column].ids, i = ids.indexOf(id);
  if (key === 'ArrowUp') return ids[i - 1];
  if (key === 'ArrowDown') return ids[i + 1];
  return undefined;
}

function Legend({ tree }) {
  const line = (cls) => <svg className="rt-sw" width="22" height="8" viewBox="0 0 22 8" aria-hidden="true"><path className={`rt-line ${cls}`} d="M1 4H21" /></svg>;
  return (
    <div className="rt-legend">
      <span>{line('')}선행</span>
      <span>{line('on')}고른 길</span>
      {tree.edges.some((e) => e.cyclic) && <span>{line('is-cyc')}선행 순환</span>}
      {tree.edges.some((e) => e.backward) && <span>{line('is-back')}마일스톤 순서를 거스르는 선행</span>}
      <span><span className="rt-key is-locked" />잠김 = 선행이 안 끝남</span>
      <span><span className="rt-block">막힘</span>결정·작업 대기</span>
      <span><span className="rt-ticks"><span className="rt-tick s-live" /></span>눈금 색은 그 단계의 현재 상태다(항목 완료 여부가 아니다)</span>
    </div>
  );
}

/**
 * 트리 패널. tree: buildTree 결과, items: data.roadmap, milestones: 정렬된 data.milestones,
 * sel: 라우트의 고른 id(항목 또는 마일스톤), faded(id): 상태 필터로 흐릴 항목인지, refIso: 기준 시각.
 */
export function RoadmapTree({ tree, items, milestones, sel, faded, refIso }) {
  const boxRef = React.useRef(null);
  const width = useWidth(boxRef);
  const [dimLocked, setDimLocked] = React.useState(false);
  const g = geometry(tree, width);
  const head = HEAD[tree.mode];
  const byId = React.useMemo(() => new Map(items.map((m) => [m.id, m])), [items]);
  const msById = new Map(milestones.map((x) => [x.id, x]));
  const titleOf = (id) => byId.get(id)?.title || id;
  const path = pathOf(tree, sel);
  const selMs = sel && msById.has(sel) ? sel : null;
  const fadedN = items.filter((m) => faded(m.id)).length;

  const onKeyDown = (ev) => {
    const id = ev.currentTarget.dataset.id;
    const to = neighbour(tree, id, ev.key);
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    ev.preventDefault();
    if (!to) return;
    const el = boxRef.current?.querySelector(`.rt-node[data-id="${CSS.escape(to)}"]`);
    if (el) el.focus();
  };

  const nodeCls = (m) => {
    const out = [];
    if (sel === m.id) out.push('sel');
    else if (path.nodes.has(m.id)) out.push('on');
    else if (selMs && m.milestone === selMs) out.push('on');
    else if (path.nodes.size || selMs) out.push('dim');
    if (faded(m.id) || (dimLocked && tree.nodes[m.id].locked)) out.push('faded');
    return out.join(' ');
  };

  const sub = tree.mode === 'layer' ? '왼쪽이 먼저, 오른쪽이 나중. 선은 선행을 잇는다' : '열은 마일스톤(파일 순서). 선은 선행을 잇는다';
  return (
    // 가로 스크롤이 없으면(geometry.scroll 거짓) 패널·상자의 overflow를 풀어 열 머리가 페이지 기준으로 붙는다(DEC-51).
    // 가로 스크롤이 있으면 상자가 overflow-x를 갖고 머리는 상자 기준이라 붙지 않는다
    <Panel className={`rt-panel${g.scroll ? '' : ' is-fit'}`} title="기술 트리" sub={sub}
      badge={fadedN * 2 > items.length ? <span className="rt-faded">흐려진 항목 {fadedN}</span> : null}>
      <div className="rt-bar">
        <button type="button" className={`chip rt-lockdim ${dimLocked ? 'on' : ''}`} aria-pressed={dimLocked} onClick={() => setDimLocked(!dimLocked)}>잠긴 항목 흐리게</button>
        <Legend tree={tree} />
      </div>
      <div className={`rt-box${g.scroll ? ' is-scroll' : ''}`} ref={boxRef}>
        <div className="rt-canvas" style={{ width: g.W, height: head + g.H }}>
          <TreeEdges tree={tree} g={g} path={path} top={head} />
          {tree.columns.map((col) => (
            <div key={col.index} className={`rt-col${selMs && col.msId === selMs ? ' on' : ''}`} style={{ left: g.colX[col.index], width: g.nodeW, height: head + g.H }}>
              <TreeColumnHead col={col} ms={msById.get(col.msId)} refIso={refIso} on={!!selMs && col.msId === selMs} h={head - 6} />
              <ul className="rt-list" style={{ top: head, height: g.H }}>
                {col.ids.map((id) => {
                  const n = tree.nodes[id];
                  return <TreeNode key={id} m={byId.get(id)} n={n} x={0} y={g.padTop + n.row * (g.nodeH + g.gapY)} w={g.nodeW} h={g.nodeH} cls={nodeCls(byId.get(id))} titleOf={titleOf} onKeyDown={onKeyDown} />;
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
