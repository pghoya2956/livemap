// 묶음 개요: 코드가 보이는 나눔. 시스템 그림의 구역 안에 묶음 상자를 두고 묶음 사이 호출·import 건수를 선으로 잇는다.
// 배치는 ui/lib/arch.js communityLayout 이 계산한다 — 구역은 부품 선언 순서, 구역 안은 묶음 id 순이고 힘 배치를 쓰지 않는다(DEC-36).
// 상자를 누르면 초점이 community:<id> 로 간다. 검사 묶음은 기본 숨김이고 그쪽으로 가는 선은 상자 라벨의 수로만 보인다.
//
// 선 밀도(OQ-11 결정 focus): 선은 전부 두고 초점에서 강조한다.
//  1. 두 방향(A→B, B→A)을 한 선으로 합친다. 같은 자리에 두 번 긋는 것이라 정보 손실이 없다
//  2. 남은 선에 굵기 구간 셋을 입힌다(중위 미만 · 중위~상위10% · 상위10%)
//  3. 평소에는 모두 옅게, 묶음을 고르면 그 묶음에 닿는 선만 진하게 나머지는 흐리게
//  4. 드문 선 숨기기는 토글이고 기본은 꺼짐이다. 켜면 문턱은 짝별 건수의 중위값이고 바닥 칩이 숨긴 수를 적는다
// 까닭: 이 뷰는 무엇이 무엇에 기대는지를 보는 것이고 드물게 한 번 부르는 연결이 오히려 이상 신호다. 무엇을 감출지는 보는 사람이 정한다.
import React from 'react';
import { communityLayout } from '../lib/arch.js';

/** 상자 가운데를 잇는 선. 곧게 그으면 격자 안 상자가 선을 덮으므로 수직으로 휘어 상자 사이 틈으로 지나게 한다.
 *  휘는 쪽은 두 상자 id 의 크기로 정해 두 방향이 서로 다른 쪽으로 간다. */
function edgePath(a, b) {
  const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(60, 16 + len * 0.16) * (a.id < b.id ? 1 : -1);
  const mx = (x1 + x2) / 2 - (dy / len) * bow, my = (y1 + y2) / 2 + (dx / len) * bow;
  return `M${x1} ${y1}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2} ${y2}`;
}

/**
 * arch: data.json 의 architecture 절
 * focus: 지금 초점, onFocus: 초점 바꾸기, hideTests: 검사 묶음 숨김(기본 참), thin: 드문 선 숨김(기본 거짓)
 */
export function CommunityMap({ arch, focus, onFocus, hideTests = true, thin = false, width = 940 }) {
  const L = React.useMemo(() => communityLayout(arch, { hideTests, edges: 'pair', thin, width }), [arch, hideTests, thin, width]);
  const at = React.useMemo(() => new Map(L.boxes.map((b) => [b.id, b])), [L]);
  const sel = focus?.startsWith('community:') ? Number(focus.slice(10)) : null;
  // 굵기 구간 셋: 중위 미만 · 중위~상위10% · 상위10%. 구간 경계는 자료가 정한다
  const ns = React.useMemo(() => L.allLines.map((l) => l.n).sort((a, b) => a - b), [L]);
  const mid = ns[Math.floor(ns.length * 0.5)] ?? 1, top = ns[Math.floor(ns.length * 0.9)] ?? mid;
  const width3 = (n) => (n >= top ? 2.6 : n >= mid ? 1.4 : 0.7);

  if (!L.boxes.length) return <p className="empty">보이는 묶음이 없습니다. 보이기 토글에서 검사를 켜면 보입니다.</p>;
  return (
    <div className="am-wrap am-comm" data-lines={L.lines.length} data-hidden-lines={L.thinHidden} data-pairs={L.allLines.length} data-cut={L.cut}>
      <svg className="am-svg" width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} role="img"
        aria-label={`묶음 개요. 구역 ${L.zones.length}개, 묶음 상자 ${L.boxes.length}개, 묶음 사이 선 ${L.lines.length}개`}>
        {L.zones.map((z) => (
          <g key={z.id || '-'}>
            <rect className="am-zone" x={z.x} y={z.y} width={z.w} height={z.h} rx="12" />
            <text className="am-zone-t" x={z.x + 12} y={z.y + 17}>{z.name} · 묶음 {z.n}</text>
          </g>
        ))}
        <g className="am-edges" aria-hidden="true">
          {L.lines.map((l) => {
            const a = at.get(l.from), b = at.get(l.to);
            if (!a || !b) return null;
            const on = sel != null && (l.from === sel || l.to === sel);
            return (
              <path key={`${l.from}>${l.to}`} data-edge={`${l.from}>${l.to}`} data-n={l.n}
                className={`am-edge${on ? ' on' : ''}${sel != null && !on ? ' dim' : ''}`}
                d={edgePath(a, b)} strokeWidth={width3(l.n)}>
                <title>{`${a.name} ${l.both ? '↔' : '→'} ${b.name} · ${l.n}건${Object.keys(l.kinds || {}).length ? ` (${Object.entries(l.kinds).map(([k, v]) => `${k} ${v}`).join(' · ')})` : ''}`}</title>
              </path>
            );
          })}
        </g>
        {L.boxes.map((b) => (
          <g key={b.id} className={`am-box am-cbox${sel === b.id ? ' sel' : ''}`} tabIndex={0} role="button" data-id={b.id}
            aria-label={`묶음 ${b.name}, 노드 ${b.n}개${b.lanes.length ? `, 층 ${b.lanes.join(' ')}` : ''}${b.inherited ? `, 물려받은 노드 ${b.inherited}` : ''}${b.hiddenN ? `, 숨긴 묶음으로 ${b.hiddenN}` : ''}`}
            onClick={() => onFocus?.(`community:${b.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus?.(`community:${b.id}`); } }}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" />
            <text className="am-t" x={b.x + 9} y={b.y + 21}>{b.name.length > 17 ? `${b.name.slice(0, 16)}…` : b.name}</text>
            <text className="am-m" x={b.x + 9} y={b.y + 37}>노드 {b.n}{b.inherited ? ` · 물려받음 ${b.inherited}` : ''}</text>
            {b.hiddenN > 0 && <text className="am-m am-hid" x={b.x + 9} y={b.y + 50}>숨긴 묶음으로 {b.hiddenN}</text>}
          </g>
        ))}
      </svg>
      <div className="am-bar">
        <span className="chip">상자 {L.boxes.length}{L.hidden.length ? ` · 숨긴 묶음 ${L.hidden.length}` : ''}</span>
        {/* 드문 선 숨김을 켜면 숨긴 수가 0이어도 문턱을 적는다. 켰는데 아무 말이 없으면 문턱이 얼마인지 볼 자리가 없다 */}
        <span className="chip am-linechip">선 {L.lines.length}{thin ? ` · 건수 ${L.cut} 미만 ${L.thinHidden} 숨김` : ''}</span>
        <span className="chip">굵기 = 건수 구간 셋 · 두 방향은 한 선</span>
        <span className="chip">{sel == null ? '상자를 고르면 닿는 선만 진해진다' : '고른 묶음에 닿는 선'}</span>
      </div>
    </div>
  );
}
