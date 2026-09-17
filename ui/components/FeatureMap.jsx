// 기능 지도: 흐름(레인)마다 구역을 두고, 기능을 허브와 단계 점의 경로로 그린다.
// 컨테이너 픽셀 크기를 좌표계로 써서 글자가 실제 크기로 그려진다. 함께 바뀐 기능은 흐르는 선으로 잇는다.
// 레인·기능 이름은 SVG 위 절대 위치 HTML 라벨이라 폭을 넘으면 말줄임한다(겹침 0).
import React from 'react';
import { STATUS } from '../lib/format.js';
import { StepMark, Proj } from './primitives.jsx';

const LAYERS = [['live', '동작'], ['mock', '목업'], ['planned', '계획'], ['next', '구상'], ['links', '연결']];
const HEAD = 28; // 구역 머리(레인 이름) 높이
const LABEL_H = 16; // 기능 라벨 한 줄 높이

function useSize(ref) {
  const [size, setSize] = React.useState({ w: 800, h: 480 });
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 레인을 파일 순서 그대로 두 열로 나눈다. 열마다 행 높이가 같고, 두 열의 기능 수 차가 가장 작은 경계를 고른다. */
function layout(journeys, W, H) {
  const lanes = [...new Set(journeys.map((j) => j.lane))];
  const laneJ = lanes.map((l) => journeys.filter((j) => j.lane === l));
  const top = 50, bottom = H - 46, gx = 14, gap = 12;
  let cols = [lanes.map((_, i) => i)];
  if (lanes.length > 1) {
    const cnt = (ids) => ids.reduce((s, i) => s + laneJ[i].length, 0);
    let best = 1, bestD = Infinity;
    for (let k = 1; k < lanes.length; k++) {
      const a = lanes.slice(0, k).map((_, i) => i), b = lanes.slice(k).map((_, i) => i + k);
      const d = Math.abs(cnt(a) + a.length - cnt(b) - b.length);
      if (d < bestD) { bestD = d; best = k; }
    }
    cols = [lanes.slice(0, best).map((_, i) => i), lanes.slice(best).map((_, i) => i + best)];
  }
  const nJ = cols.map((ids) => ids.reduce((s, i) => s + laneJ[i].length, 0));
  const leftFrac = cols.length === 1 ? 1 : nJ[0] > nJ[1] ? 0.6 : nJ[0] < nJ[1] ? 0.4 : 0.5;
  const leftW = cols.length === 1 ? W - gx * 2 : Math.round((W - gx * 3) * leftFrac);
  const zones = [], rows = [];
  cols.forEach((ids, c) => {
    const x = c === 0 ? gx : gx * 2 + leftW, w = c === 0 ? leftW : W - gx * 3 - leftW;
    const avail = bottom - top - gap * (ids.length - 1);
    const rowH = Math.max(LABEL_H + 12, (avail - HEAD * ids.length) / Math.max(1, nJ[c]));
    let y = top;
    ids.forEach((li) => {
      const js = laneJ[li], h = HEAD + rowH * js.length;
      const z = { lane: lanes[li], x, y, w, h, kind: js.every((j) => j.status === 'next') ? 'cool' : js.some((j) => j.status !== 'live') ? 'warm' : '' };
      zones.push(z);
      js.forEach((j, ri) => {
        const rowTop = y + HEAD + rowH * ri;
        const labelTop = rowTop + Math.min(8, Math.max(0, (rowH - 36) / 2));
        const cy = rowTop + Math.min(34, Math.max(labelTop - rowTop + LABEL_H + 10, rowH * 0.5 + 10));
        const hx = x + 20, sx = x + 46, ex = x + w - 18;
        const n = j.steps.length;
        const stepW = n > 1 ? Math.min(40, (ex - sx) / (n - 1)) : 0;
        const amp = Math.min(5, rowH / 10);
        const pts = j.steps.map((_, i) => [sx + i * stepW, cy + Math.sin(i * 1.2 + ri) * amp]);
        const rMax = Math.max(4, rowH - (cy - rowTop) - 2);
        rows.push({ j, z, rowTop, rowH, labelTop, cy, hx, ex, pts, rMax });
      });
      y += h + gap;
    });
  });
  return { zones, rows };
}

/**
 * journeys: overview.json journeys[](1.0.1 키 + counts·commits·series, steps[]: {id, label, status, warn, hits})
 * links: [{ a, b, n }] 함께 바뀐 기능 쌍과 횟수
 * folded: 지도에 올리지 못한 기능 수, foldedIncomplete: 그중 미완성이 있는지(바닥 칩 문구)
 * next: { id, title, waitingOn, waitingWho } 다음 안내(#/roadmap/<id> 링크)
 */
export function FeatureMap({ journeys, links = [], selected, onSelect, next = null, stepCounts, folded = 0, foldedIncomplete = false, badgeJourneys }) {
  const ref = React.useRef(null);
  const { w, h } = useSize(ref);
  const [on, setOn] = React.useState({ live: true, mock: true, planned: true, next: true, links: true });
  const [focus, setFocus] = React.useState(false);
  React.useEffect(() => {
    if (!focus) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setFocus(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [focus]);
  const W = Math.max(360, w), H = Math.max(300, h);
  const { zones, rows } = React.useMemo(() => layout(journeys, W, H), [journeys, W, H]);
  const pos = Object.fromEntries(rows.map((r) => [r.j.id, [r.hx, r.cy]]));
  const pick = (id) => { setFocus(true); onSelect?.(id); };
  const counts = { ...stepCounts, links: links.length };
  const all = badgeJourneys || journeys;
  const badge = (k, cls, word) => { const n = all.filter((j) => j.status === k).length; return n ? <span key={k} className={`badge ${cls}`}>{word} 기능 {n}</span> : null; };

  if (!all.length) {
    return <div className="mapwrap empty"><p className="mapempty">아직 기능이 없습니다. 여정 파일에 적으면 여기에 보입니다</p></div>;
  }
  return (
    <div className="mapwrap" ref={ref} onDoubleClick={() => setFocus(false)}>
      <svg className={`map ${focus ? 'dim' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="기능과 단계 지도">
        <defs>
          <pattern id="lm-grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#1A232D" /></pattern>
          <filter id="lm-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width={W} height={H} fill="url(#lm-grid)" />
        {zones.map((z) => <rect key={z.lane} className={`zone ${z.kind}`} x={z.x} y={z.y} width={z.w} height={z.h} rx="14" />)}
        {on.links && (
          <g>
            {links.map((l) => {
              const [ax, ay] = pos[l.a] || [], [bx, by] = pos[l.b] || [];
              if (ax == null || bx == null) return null;
              const bend = ax === bx ? -Math.min(90, 18 + Math.abs(by - ay) * 0.3) : 0;
              const mx = (ax + bx) / 2 + bend, my = (ay + by) / 2 - (ax === bx ? 0 : 40);
              const sel = l.a === selected || l.b === selected;
              return (
                <path key={`${l.a}|${l.b}`} className={`link ${sel ? 'sel' : ''}`} d={`M${ax} ${ay} Q${mx.toFixed(1)} ${my.toFixed(1)} ${bx} ${by}`}
                  strokeWidth={(0.6 + l.n / 6).toFixed(2)} strokeOpacity={(0.16 + Math.min(l.n, 12) / 26).toFixed(2)}>
                  <title>함께 바뀐 변경 {l.n}회</title>
                </path>
              );
            })}
          </g>
        )}
        {rows.map(({ j, z, rowTop, rowH, cy, hx, pts, rMax }) => {
          const r0 = Math.min(4 + Math.min(j.commits, 20) / 4, rMax);
          const hot = [...j.steps].sort((a, b) => b.hits - a.hits)[0];
          const d = `M${hx} ${cy} ` + pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
          return (
            <g key={j.id} className={`jg jrow ${j.id === selected ? 'sel' : ''}`} onClick={() => pick(j.id)} tabIndex={0} role="button"
              aria-label={`${j.title}, ${j.actor}, 동작 ${j.counts.live}/${j.steps.length}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(j.id); } }}>
              <title>{j.title} · {j.goal}</title>
              <rect x={z.x + 4} y={rowTop} width={z.w - 8} height={rowH} fill="transparent" />
              <path className={`route ${j.status}`} d={d} />
              {j.steps.map((s, i) => {
                if (!on[s.status]) return null;
                const [x, y] = pts[i], r = Math.min(3.4 + Math.min(s.hits, 15) / 5, rMax);
                const label = `${s.label} · ${STATUS[s.status]?.word ?? s.status}${s.hits ? ` · 14일 변경 ${s.hits}` : ''}${s.warn ? ' · 경고' : ''}`;
                const warn = s.warn && <circle className="warnring" cx={x} cy={y} r={r + 2.5} />;
                if (s.status === 'mock') {
                  return (
                    <React.Fragment key={i}>
                      {warn}
                      <g>
                        <circle cx={x} cy={y} r={r} fill="#0B1016" stroke="var(--amber)" strokeWidth="1.5" />
                        <path d={`M${x} ${(y - r).toFixed(1)}A${r} ${r} 0 0 0 ${x} ${(y + r).toFixed(1)}Z`} className="n-mock" />
                        <title>{label}</title>
                      </g>
                    </React.Fragment>
                  );
                }
                return (
                  <React.Fragment key={i}>
                    {warn}
                    <g>
                      {s.status === 'live' && s === hot && s.hits > 0 && <circle className="ring" cx={x} cy={y} r={r} />}
                      <circle className={`n-${s.status}`} cx={x} cy={y} r={r} filter={s.status === 'live' ? 'url(#lm-glow)' : undefined} />
                      <title>{label}</title>
                    </g>
                  </React.Fragment>
                );
              })}
              <circle className="hub" cx={hx} cy={cy} r={r0.toFixed(1)} />
            </g>
          );
        })}
      </svg>
      <div className={`jlabels ${focus ? 'dim' : ''}`} aria-hidden="true">
        {zones.map((z) => (
          <div key={z.lane} className="zl" style={{ left: z.x + 14, top: z.y + 7, width: z.w - 28 }} title={z.lane}><Proj>{z.lane}</Proj></div>
        ))}
        {rows.map(({ j, z, labelTop, hx }) => (
          <div key={j.id} className={`jl ${j.id === selected ? 'sel' : ''}`} style={{ left: hx - 6, top: labelTop, width: z.x + z.w - 12 - (hx - 6) }} title={`${j.title} · ${j.actor}`}>
            <span className="t"><Proj>{j.title}</Proj></span>
            <span className="s"><span className="a"><Proj>{j.actor}</Proj></span><span className="c">· {j.counts.live}/{j.steps.length}</span></span>
          </div>
        ))}
      </div>
      <div className="badges">{badge('mock', 'amber', '목업')}{badge('next', 'violet', '구상')}</div>
      <div className="layers" aria-label="레이어">
        {LAYERS.map(([k, word]) => (
          <button key={k} className={`lyr ${on[k] ? '' : 'off'}`} aria-pressed={on[k]} onClick={() => setOn({ ...on, [k]: !on[k] })}>
            {k === 'links' ? <span className="sw" /> : <StepMark status={k} />}{word} <span className="num">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="mapbar">
        <span className="chip"><span className="dot" />함께 바뀐 기능 연결 {links.length}</span>
        <span className="chip">점 크기 = 14일 변경 수</span>
        {folded > 0 && <a className="chip mapfold" href="#/journeys">{foldedIncomplete ? `외 ${folded}` : `완성 기능 ${folded} 접힘`} · 기능 화면 →</a>}
        {next && (
          <a className="mapnote" href={`#/roadmap/${encodeURIComponent(next.id)}`} title={next.title}>
            다음 · <Proj>{next.title}</Proj>{next.waitingOn ? <> · <Proj>{next.waitingWho ? `${next.waitingWho} ` : ''}</Proj>결정 대기</> : null} ›
          </a>
        )}
      </div>
    </div>
  );
}
