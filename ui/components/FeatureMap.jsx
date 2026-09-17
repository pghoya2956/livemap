// 기능 지도: 흐름(레인)마다 구역을 두고, 기능을 허브와 단계 점의 경로로 그린다.
// 컨테이너 픽셀 크기를 좌표계로 써서 글자가 실제 크기로 그려진다. 함께 바뀐 기능은 흐르는 선으로 잇는다.
import React from 'react';
import { STATUS } from '../lib/format.js';
import { StepMark } from './primitives.jsx';

const LAYERS = [['live', '동작'], ['mock', '목업'], ['planned', '계획'], ['next', '구상'], ['links', '연결']];

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

function layout(journeys, W, H) {
  const lanes = [...new Set(journeys.map((j) => j.lane))];
  const laneJ = lanes.map((l) => journeys.filter((j) => j.lane === l));
  const top = 50, bottom = H - 46, gx = 14;
  const big = laneJ.reduce((m, js, i) => (js.length > laneJ[m].length ? i : m), 0);
  const rest = lanes.map((_, i) => i).filter((i) => i !== big);
  const leftW = rest.length ? Math.round((W - gx * 3) * 0.6) : W - gx * 2;
  const zones = [];
  zones[big] = { x: gx, y: top, w: leftW, h: bottom - top };
  if (rest.length) {
    const gap = 12, tot = rest.reduce((s, i) => s + laneJ[i].length, 0), avail = bottom - top - gap * (rest.length - 1);
    let y = top;
    rest.forEach((i) => { const h = (avail * laneJ[i].length) / tot; zones[i] = { x: gx * 2 + leftW, y, w: W - gx * 3 - leftW, h }; y += h + gap; });
  }
  const rows = [];
  lanes.forEach((lane, li) => {
    const z = zones[li], js = laneJ[li];
    z.lane = lane;
    z.kind = js.every((j) => j.status === 'next') ? 'cool' : js.some((j) => j.status !== 'live') ? 'warm' : '';
    const rowH = (z.h - 28) / js.length;
    js.forEach((j, ri) => {
      const rowTop = z.y + 28 + rowH * ri;
      const cy = rowTop + Math.min(rowH * 0.5 + 10, 34);
      const hx = z.x + 20, sx = z.x + 46, ex = z.x + z.w - 18;
      const n = j.steps.length;
      const stepW = n > 1 ? Math.min(40, (ex - sx) / (n - 1)) : 0;
      const amp = Math.min(5, rowH / 10);
      const pts = j.steps.map((_, i) => [sx + i * stepW, cy + Math.sin(i * 1.2 + ri) * amp]);
      rows.push({ j, z, rowTop, rowH, cy, hx, ex, pts });
    });
  });
  return { zones, rows };
}

/**
 * journeys: [{ id, title, actor, lane, goal, status, counts, commits, steps: [{ label, status, hits }] }]
 * links: [{ a, b, n }] 함께 바뀐 기능 쌍과 횟수
 */
export function FeatureMap({ journeys, links = [], selected, onSelect, nextNote, stepCounts }) {
  const ref = React.useRef(null);
  const { w, h } = useSize(ref);
  const [on, setOn] = React.useState({ live: true, mock: true, planned: true, next: true, links: true });
  const [focus, setFocus] = React.useState(false);
  const W = Math.max(360, w), H = Math.max(300, h);
  const { zones, rows } = React.useMemo(() => layout(journeys, W, H), [journeys, W, H]);
  const pos = Object.fromEntries(rows.map((r) => [r.j.id, [r.hx, r.cy]]));
  const pick = (id) => { setFocus(true); onSelect?.(id); };
  const counts = { ...stepCounts, links: links.length };
  const badge = (k, cls, word) => { const n = journeys.filter((j) => j.status === k).length; return n ? <span key={k} className={`badge ${cls}`}>{word} 기능 {n}</span> : null; };

  return (
    <div className="mapwrap" ref={ref} onDoubleClick={() => setFocus(false)}>
      <svg className={`map ${focus ? 'dim' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="기능과 단계 지도">
        <defs>
          <pattern id="lm-grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#1A232D" /></pattern>
          <filter id="lm-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width={W} height={H} fill="url(#lm-grid)" />
        {zones.map((z) => (
          <g key={z.lane}>
            <rect className={`zone ${z.kind}`} x={z.x} y={z.y} width={z.w} height={z.h} rx="14" />
            <text className="zlabel" x={z.x + 14} y={z.y + 20}>{z.lane}</text>
          </g>
        ))}
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
        {rows.map(({ j, z, rowTop, rowH, cy, hx, ex, pts }) => {
          const r0 = 4 + Math.min(j.commits, 20) / 4;
          const hot = [...j.steps].sort((a, b) => b.hits - a.hits)[0];
          const d = `M${hx} ${cy} ` + pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
          return (
            <g key={j.id} className={`jg jrow ${j.id === selected ? 'sel' : ''}`} onClick={() => pick(j.id)} tabIndex={0} role="button" aria-label={`${j.title}, ${j.actor}, 동작 ${j.counts.live}/${j.steps.length}`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(j.id); } }}>
              <title>{j.title} · {j.goal}</title>
              <rect x={z.x + 4} y={rowTop} width={z.w - 8} height={rowH} fill="transparent" />
              <path className={`route ${j.status}`} d={d} />
              <text className="jtitle" x={hx - 6} y={cy - 13}>{j.title}</text>
              <text className="jsub" x={ex} y={cy - 13} textAnchor="end">{j.actor} · {j.counts.live}/{j.steps.length}</text>
              {j.steps.map((s, i) => {
                if (!on[s.status]) return null;
                const [x, y] = pts[i], r = 3.4 + Math.min(s.hits, 15) / 5;
                const label = `${s.label} · ${STATUS[s.status]?.word ?? s.status}${s.hits ? ` · 14일 변경 ${s.hits}` : ''}`;
                if (s.status === 'mock') {
                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r={r} fill="#0B1016" stroke="var(--amber)" strokeWidth="1.5" />
                      <path d={`M${x} ${(y - r).toFixed(1)}A${r} ${r} 0 0 0 ${x} ${(y + r).toFixed(1)}Z`} className="n-mock" />
                      <title>{label}</title>
                    </g>
                  );
                }
                return (
                  <g key={i}>
                    {s.status === 'live' && s === hot && s.hits > 0 && <circle className="ring" cx={x} cy={y} r={r} />}
                    <circle className={`n-${s.status}`} cx={x} cy={y} r={r} filter={s.status === 'live' ? 'url(#lm-glow)' : undefined} />
                    <title>{label}</title>
                  </g>
                );
              })}
              <circle className="hub" cx={hx} cy={cy} r={r0.toFixed(1)} />
            </g>
          );
        })}
      </svg>
      <div className="badges">{badge('mock', 'amber', '목업')}{badge('next', 'violet', '구상')}</div>
      <div className="layers" aria-label="레이어">
        {LAYERS.map(([k, word]) => (
          <button key={k} className={`lyr ${on[k] ? '' : 'off'}`} aria-pressed={on[k]} onClick={() => setOn({ ...on, [k]: !on[k] })}>
            {k === 'links' ? <span className="sw" style={{ background: 'var(--cyan)' }} /> : <StepMark status={k} />}{word} <span className="num">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="mapfoot">
        <span className="chip"><span className="dot" style={{ color: 'var(--cyan)' }} />함께 바뀐 기능 연결 {links.length}</span>
        <span className="chip">점 크기 = 14일 변경 수</span>
      </div>
      {nextNote && <div className="mapnote">{nextNote}</div>}
    </div>
  );
}
