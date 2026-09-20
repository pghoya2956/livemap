// 층 요약과 층 배치. 둘 다 ui/lib/arch.js laneLayout 이 좌표를 내고 여기서는 DOM 에 붙이기만 한다.
//  · 층 요약(초점 sys · 기능 없음 · 나눔 「사람이 그린 것」): 층마다 상자 하나에 이름과 노드 수, 층 사이 선에 연결 건수, 두 줄 격자.
//  · 층 배치(그 밖): 열이 층 순서, 오른쪽 곡선과 되돌아가는 왼쪽 곡선, 추정 점선, 위반 주황 점선, 허브 들어오는 선 한 가닥 묶기.
// 묶은 선을 눌러도 초점은 옮기지 않는다(스펙 「화면 모델」 허브 절).
import React from 'react';
import { laneLayout, laneName } from '../lib/arch.js';

const KIND_WORD = { module: '파일', screen: '화면 경로', api: 'API', auth: '로그인', function: 'DB 함수', table: '테이블', symbol: '함수' };

/** 열 머리 글자: 층이 여럿이면 둘까지 적고 나머지는 수로. 열 폭을 넘기면 옆 열과 겹친다 */
function colLabel(c) {
  if (!c.names.length) return c.unassigned ? '미배정' : '층 없음';
  return c.names.length <= 2 ? c.names.join(' · ') : `${c.names.slice(0, 2).join(' · ')} 외 ${c.names.length - 2}`;
}

/** 층 요약의 선: 오른쪽으로 가면 아래 곡선, 되돌아가면 위 곡선 */
function summaryPath(a, b, back) {
  const x1 = a.x + a.w / 2, y1 = back ? a.y : a.y + a.h, x2 = b.x + b.w / 2, y2 = back ? b.y : b.y + b.h;
  const d = back ? -26 : 26;
  return `M${x1} ${y1}C${x1} ${y1 + d} ${x2} ${y2 + d} ${x2} ${y2}`;
}

/** 층 배치의 선: 오른쪽 곡선, 되돌아가는 선은 왼쪽 곡선 */
function nodePath(a, b) {
  const right = b.x >= a.x + a.w;
  const x1 = right ? a.x + a.w : a.x, y1 = a.y + a.h / 2;
  const x2 = right ? b.x : b.x + b.w, y2 = b.y + b.h / 2;
  const dx = Math.max(20, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1}C${x1 + (right ? dx : -dx)} ${y1} ${x2 - (right ? dx : -dx)} ${y2} ${x2} ${y2}`;
}

/** 층 요약: 상자를 열면 초점이 group:<층> 으로 간다 */
export function LaneSummary({ arch, hidden, focus, onFocus }) {
  const L = React.useMemo(() => laneLayout(arch, { hidden }), [arch, hidden]);
  const at = React.useMemo(() => new Map(L.boxes.map((b) => [b.id, b])), [L]);
  const sel = focus?.startsWith('group:') ? focus.slice(6) : null;
  if (!L.boxes.length) return <p className="empty">보이는 층이 없습니다. 선언 폴더에 층을 적으면 여기 섭니다.</p>;
  return (
    <div className="am-wrap am-lanes">
      <svg className="am-svg" width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} role="img"
        aria-label={`층 요약. 층 상자 ${L.boxes.length}개, 층 사이 선 ${L.lines.length}개`}>
        <g className="am-edges" aria-hidden="true">
          {L.lines.map((l) => {
            const a = at.get(l.from), b = at.get(l.to);
            if (!a || !b) return null;
            return (
              <g key={`${l.from}>${l.to}`}>
                <path className={`am-edge am-lane-edge${l.back ? ' is-back' : ''}`} data-edge={`${l.from}>${l.to}`} d={summaryPath(a, b, l.back)}
                  strokeWidth={(0.7 + Math.min(l.n, 300) / 120).toFixed(2)}>
                  <title>{`${a.name} → ${b.name} · ${l.n}건${l.back ? ' (되돌아가는 선)' : ''}`}</title>
                </path>
              </g>
            );
          })}
        </g>
        {L.lines.map((l) => {
          const a = at.get(l.from), b = at.get(l.to);
          if (!a || !b) return null;
          return <text key={`n${l.from}>${l.to}`} className="am-n" x={(a.x + a.w / 2 + b.x + b.w / 2) / 2} y={(l.back ? Math.min(a.y, b.y) - 14 : Math.max(a.y, b.y) + a.h + 18)}>{l.n}</text>;
        })}
        {L.boxes.map((b) => (
          <g key={b.id} className={`am-box am-lbox${sel === b.id ? ' sel' : ''}`} data-id={b.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="9" />
            <text className="am-t" x={b.x + 11} y={b.y + 22}>{b.name.length > 14 ? `${b.name.slice(0, 13)}…` : b.name}</text>
            <text className="am-m" x={b.x + 11} y={b.y + 39}>노드 {b.n}{b.container ? ` · ${b.container}` : ''}</text>
            {b.hiddenN > 0 && <text className="am-m am-hid" x={b.x + 11} y={b.y + 53}>숨긴 층으로 {b.hiddenN}</text>}
          </g>
        ))}
      </svg>
      <div className="am-open" style={{ width: L.W, height: L.H }}>
        {L.boxes.map((b) => (
          <button key={b.id} type="button" className="am-openbtn" style={{ left: b.x + b.w - 42, top: b.y + 8 }}
            aria-label={`${b.name} 층 열기`} onClick={() => onFocus?.(`group:${b.id}`)}>열기</button>
        ))}
      </div>
    </div>
  );
}

/** 그릴 노드가 없을 때의 문구. 화면·API·로그인·DB 함수·테이블 층은 자료(architecture.modules)가 파일 노드만 담아
 *  노드 목록을 셀 수 없다. 그 층의 노드는 기능을 고르면 그 길 위에서 보인다 — 왜 비었는지를 말한다 */
function EmptyNodes({ arch, focus, flow }) {
  const id = focus?.startsWith('group:') ? focus.slice(6) : null;
  const lane = id && (arch.lanes || []).find((l) => l.id === id);
  const body = (() => {
  if (lane && lane.kind !== 'code') {
    return (
      <p className="empty">
        「{laneName(lane)}」 층의 노드 {lane.nodes}개는 목록이 자료에 없습니다. 생성물의 파일 목록은 코드 파일만 담습니다.
        이 층의 노드는 길 패널에서 기능을 고르면 그 길 위에 섭니다.
      </p>
    );
  }
  if (flow) return <p className="empty">고른 기능의 길과 이 초점이 겹치는 노드가 없습니다. 기능 고르기를 풀거나 다른 초점을 고르세요.</p>;
  return <p className="empty">이 초점에 그릴 노드가 없습니다. 위 그림에서 부품이나 묶음을 고르세요.</p>;
  })();
  // 빈 문구도 그림 상자 안에 둔다. 상자 높이가 고정이라 초점이 바뀌어도 페이지 높이가 그대로다(SC-10)
  return <div className="am-wrap am-nodes">{body}</div>;
}

/** 층 배치: 열이 층 순서, 열 안은 barycenter 두 번. 노드 초점이면 안에 든 것과 1홉 이웃을 점선 상자로 그린다 */
export function LaneMap({ arch, focus, flow, hidden, hubMin, fn = null, onFocus, neighbourIds = new Set() }) {
  const L = React.useMemo(() => laneLayout(arch, { mode: 'nodes', focus, flow, hidden, hubMin, fn }), [arch, focus, flow, hidden, hubMin, fn]);
  const at = React.useMemo(() => new Map(L.boxes.map((b) => [b.id, b])), [L]);
  const boxRef = React.useRef(null);
  const sel = focus && !/^(sys|part:|community:|group:)/.test(focus) ? focus : null;

  // Tab 으로 첫 노드에 닿고 화살표로 옮긴다(← 앞 열, → 뒤 열, ↑↓ 같은 열 이웃)
  const onKeyDown = (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onFocus?.(ev.currentTarget.dataset.id); }
      return;
    }
    ev.preventDefault();
    const b = at.get(ev.currentTarget.dataset.id);
    if (!b) return;
    const col = (i) => L.boxes.filter((x) => x.column === i).sort((p, q) => p.row - q.row);
    let to = null;
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      const same = col(b.column);
      to = same[same.findIndex((x) => x.id === b.id) + (ev.key === 'ArrowUp' ? -1 : 1)];
    } else {
      const dir = ev.key === 'ArrowLeft' ? -1 : 1;
      for (let i = b.column + dir; i >= 0 && i < L.columns.length; i += dir) { const c = col(i); if (c.length) { to = c[Math.min(c.length - 1, b.row)] || c[0]; break; } }
    }
    const el = to && boxRef.current?.querySelector(`.am-nbox[data-id="${CSS.escape(to.id)}"]`);
    if (el) el.focus();
  };

  if (!L.boxes.length) return <EmptyNodes arch={arch} focus={focus} flow={flow} />;
  return (
    <div className="am-wrap am-nodes" ref={boxRef}>
      <svg className="am-svg" width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} role="img"
        aria-label={`층 배치. 열 ${L.columns.length}개, 노드 ${L.boxes.length}개, 선 ${L.lines.length}개`}>
        {L.columns.map((c) => (
          <text key={c.index} className="am-col-t" x={c.x + 4} y={20}>{colLabel(c)}</text>
        ))}
        <g className="am-edges" aria-hidden="true">
          {L.lines.map((l) => {
            const a = at.get(l.from), b = at.get(l.to);
            if (!a || !b) return null;
            const back = b.column < a.column;
            const bad = (a.violations || []).some((v) => v.to === l.to);
            // 선언 좌표 사슬(is-flow)과 기능의 실측 선(is-measured)을 갈라 그린다. 모양 규칙은 기존 그대로다
            const cls = ['am-edge', 'am-node-edge', back && 'is-back', l.bundled && 'is-bundle', bad && 'is-bad',
              l.kind === 'flow' && 'is-flow', l.kind === 'flowEdge' && 'is-measured', l.kind === 'symbol' && 'is-symbol', l.broken && 'is-broken'].filter(Boolean).join(' ');
            return (
              <path key={`${l.from}>${l.to}|${l.kind}`} data-edge={`${l.from}>${l.to}`} className={cls} d={nodePath(a, b)}
                strokeWidth={l.bundled ? (1 + Math.min(l.n, 40) / 14).toFixed(2) : 1}
                tabIndex={l.bundled ? 0 : undefined} role={l.bundled ? 'button' : undefined}
                aria-label={l.bundled ? `묶은 선 ${l.n}가닥, ${a.name} 외 ${l.n - 1}개에서 ${b.name} 로. 눌러도 초점은 옮기지 않는다` : undefined}>
                <title>{l.bundled ? `묶은 선 ${l.n}가닥 → ${b.name}\n${l.members.join('\n')}`
                  : `${a.name} → ${b.name}${l.kind === 'flow' ? ' · 선언 좌표' : l.kind === 'flowEdge' ? ` · 실측${l.relation ? ` ${l.relation}` : ''}` : l.kind === 'symbol' ? ` · 함수 사이 ${l.relation || 'calls'}` : ''}${l.n > 1 ? ` · ${l.n}줄` : ''}${bad ? ' · 규칙 위반' : ''}${l.broken ? ' · 끊김' : ''}`}</title>
              </path>
            );
          })}
        </g>
        {L.boxes.map((b) => {
          const near = neighbourIds.has(b.id) && b.id !== sel;
          const bad = (b.violations || []).length > 0;
          const to = b.folded ? b.focusTo : b.id;
          const label = b.folded
            ? `묶음 ${b.name}, 접힌 노드 ${b.n}개${b.focusTo ? ', 누르면 그 묶음으로' : ''}`
            : `${KIND_WORD[b.kind] ?? b.kind} ${b.name}${b.communityName ? `, 묶음 ${b.communityName}` : ''}${bad ? ', 규칙 위반' : ''}${near ? ', 1홉 이웃' : ''}`;
          return (
            <g key={b.id} className={`am-box am-nbox k-${b.kind}${b.folded ? ' is-fold' : ''}${sel === b.id ? ' sel' : ''}${near ? ' near' : ''}${b.onFlow ? ' on' : ''}${bad ? ' bad' : ''}`}
              tabIndex={0} role="button" data-id={b.id} onKeyDown={onKeyDown} onClick={() => to && onFocus?.(to)} aria-label={label}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="7" />
              <circle className="am-kind" cx={b.x + 12} cy={b.y + b.h / 2} r="4" />
              <text className="am-t" x={b.x + 23} y={b.y + 16}>{b.name.length > 22 ? `…${b.name.slice(-21)}` : b.name}</text>
              <text className="am-m" x={b.x + 23} y={b.y + 30}>
                {b.folded ? `묶음 · 접힌 노드 ${b.n}` : b.kind === 'symbol' ? `${b.module.split('/').pop()}${b.line ? `:${b.line}` : ''}` : b.communityName ? `묶음 ${b.communityName.length > 14 ? `${b.communityName.slice(0, 13)}…` : b.communityName}` : KIND_WORD[b.kind] ?? b.kind}
                {b.symbols ? ` · 함수 ${b.symbols}` : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="am-bar">
        <span className="chip">{L.level === 'fn' ? '함수' : '파일'} 노드 {L.boxes.length} · 선 {L.lines.length}</span>
        {/* 이웃이 없는 심볼은 상자 하나가 맞는 답이다. 왜 하나뿐인지 적지 않으면 막다른 길로 보인다 */}
        {L.lonelySymbol && <span className="chip am-lonely">이 함수를 부르는 곳도, 이 함수가 부르는 곳도 없다</span>}
        {L.folded > 0 && <span className="chip am-foldchip">노드 {L.folded}개를 묶음 {L.boxes.filter((b) => b.folded).length}개로 접음 · 상자를 누르면 그 묶음으로</span>}
        {L.lines.some((l) => l.bundled) && <span className="chip">묶은 선 {L.lines.filter((l) => l.bundled).length}</span>}
        {L.lines.some((l) => l.kind === 'flowEdge') && <span className="chip">기능 선 실측 {L.lines.filter((l) => l.kind === 'flowEdge').length} · 선언 {L.lines.filter((l) => l.kind === 'flow').length}</span>}
        <span className="chip">열 = 층 순서</span>
      </div>
    </div>
  );
}
