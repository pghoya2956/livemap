// 시스템 그림: 경계 안에 부품 상자를 두고 부품 사이 연결을 실측 건수로 잇는다. 첫 독자가 코드를 안 읽는 제품 오너라
// 상자 글자에 파일 경로와 import 수를 넣지 않는다(SC-5). SVG 는 엔진이 직접 그리고 Mermaid 렌더러를 싣지 않는다(DEC-22).
// 배치는 ui/lib/arch.js systemLayout 이 계산한다.
import React from 'react';
import { systemLayout, laneName } from '../lib/arch.js';
import { Proj } from './primitives.jsx';

const COUNT_WORD = [['screens', '화면'], ['files', '파일'], ['symbols', '함수'], ['mocks', '목업']];

/** 부품 상자를 잇는 선. 오른쪽으로 가면 아래로 휘고 되돌아가면 위로 휘어 두 방향이 겹치지 않는다. */
function depPath(a, b) {
  const right = b.x > a.x;
  const x1 = right ? a.x + a.w : a.x, y1 = a.y + a.h / 2;
  const x2 = right ? b.x : b.x + b.w, y2 = b.y + b.h / 2;
  const dx = Math.max(24, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1}C${x1 + (right ? dx : -dx)} ${y1} ${x2 - (right ? dx : -dx)} ${y2} ${x2} ${y2}`;
}

/**
 * arch: architecture 절, actors: 사람 행에 쓸 배우 이름, flow: 고른 기능(flowPath 결과 또는 null)
 * focus: 지금 초점, onFocus: 초점 바꾸기
 */
export function SystemMap({ arch, actors = [], flow = null, focus, onFocus }) {
  const L = React.useMemo(() => systemLayout(arch, { actors }), [arch, actors]);
  const at = React.useMemo(() => new Map(L.boxes.map((b) => [b.id, b])), [L]);
  const sel = focus?.startsWith('part:') ? focus.slice(5) : null;
  // 기능이 골라지면 그 길이 지나는 부품을 파란 길로 밝히고 층별 수를 겹친다
  const onPath = React.useMemo(() => {
    if (!flow) return null;
    const byContainer = new Map();
    for (const g of flow.byLane) {
      const lane = (arch.lanes || []).find((l) => l.id === g.lane);
      const c = lane?.container ?? g.nodes[0]?.module?.container ?? null;
      if (!c) continue;
      if (!byContainer.has(c)) byContainer.set(c, []);
      byContainer.get(c).push(`${laneName(lane) || g.name} ${g.nodes.length}`);
    }
    return byContainer;
  }, [flow, arch]);
  const undeclared = (arch.containers || []).filter((c) => c.kind === 'external' && !(c.dirs || []).length && !(c.schemas || []).length && !(c.externals || []).length);

  if (!L.boxes.length) {
    return <p className="empty">바깥 상대 선언이 없습니다. map/architecture/README.md 의 시스템 그림에 적으면 여기 섭니다.</p>;
  }
  return (
    <div className="am-wrap am-sys">
      <svg className="am-svg" width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} role="img"
        aria-label={`시스템 그림. 경계 ${L.zones.length}개, 부품 상자 ${L.boxes.length}개, 부품 사이 선 ${L.lines.length}개`}>
        {L.zones.map((z) => (
          <g key={z.id || '-'}>
            <rect className="am-zone" x={z.x} y={z.y} width={z.w} height={z.h} rx="12" />
            <text className="am-zone-t" x={z.x + 12} y={z.y + 17}>{z.name}</text>
          </g>
        ))}
        <g className="am-edges" aria-hidden="true">
          {L.lines.map((l) => {
            const a = at.get(l.from), b = at.get(l.to);
            if (!a || !b) return null;
            const hot = !!onPath && onPath.has(l.from) && onPath.has(l.to);
            const cls = ['am-edge', 'am-dep', l.declaredOnly && 'is-declared', l.undeclared && 'is-undeclared', hot && 'on'].filter(Boolean).join(' ');
            return (
              <g key={`${l.from}>${l.to}`}>
                <path className={cls} data-edge={`${l.from}>${l.to}`} d={depPath(a, b)}>
                  <title>{`${a.name} → ${b.name} · ${l.declaredOnly ? '선언만, 실측 0건' : `실측 ${l.n}건`}`}</title>
                </path>
                <text className="am-n" x={(a.x + a.w / 2 + b.x + b.w / 2) / 2} y={(a.y + b.y) / 2 + 26}>{l.declaredOnly ? '선언만' : l.n}</text>
              </g>
            );
          })}
        </g>
        {L.boxes.map((b) => {
          const words = COUNT_WORD.filter(([k]) => b.counts[k]).map(([k, w]) => `${w} ${b.counts[k]}`);
          const via = onPath?.get(b.id);
          return (
            <g key={b.id} className={`am-box am-part k-${b.kind}${sel === b.id ? ' sel' : ''}${via ? ' on' : ''}`} tabIndex={0} role="button" data-id={b.id}
              aria-label={`부품 ${b.name}${words.length ? `, ${words.join(', ')}` : ', 바깥 상대'}${via ? `, 고른 기능이 지난다` : ''}`}
              onClick={() => onFocus?.(`part:${b.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus?.(`part:${b.id}`); } }}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="10" />
              <text className="am-t" x={b.x + 12} y={b.y + 25}>{b.name}</text>
              <text className="am-m" x={b.x + 12} y={b.y + 44}>{words.length ? words.join(' · ') : '바깥 상대'}</text>
              {via && <text className="am-m am-on" x={b.x + 12} y={b.y + 62}>{via.join(' · ')}</text>}
              {!via && b.flows > 0 && <text className="am-m" x={b.x + 12} y={b.y + 62}>기능 {b.flows}</text>}
            </g>
          );
        })}
      </svg>
      <div className="am-bar">
        {actors.length > 0 && <span className="chip am-actors">사람 {actors.map((a) => <Proj key={a}>{a}</Proj>).reduce((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}</span>}
        <span className="chip">선의 수 = 실측 호출 건수</span>
        {undeclared.length > 0 && <span className="chip warn">선언만 있는 바깥 상대 {undeclared.length}</span>}
      </div>
    </div>
  );
}
