// 차트: 원호 계기, 상태 구간 막대, 스파크라인, 영역 차트. 모두 SVG 속성으로 그려 CSP 아래에서 동작한다.
import React from 'react';
import { STATUS, STATUS_ORDER, md } from '../lib/format.js';

/** 원호 계기. value 0~100. */
export function Gauge({ value, caption }) {
  const arc = (p) => {
    const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * p, r = 52, c = 66;
    const x = (a) => (c + r * Math.cos(a)).toFixed(1), y = (a) => (c + r * Math.sin(a)).toFixed(1);
    return `M${x(a0)} ${y(a0)} A${r} ${r} 0 ${p > 2 / 3 ? 1 : 0} 1 ${x(a1)} ${y(a1)}`;
  };
  return (
    <svg viewBox="0 0 132 122" width="132" height="122" role="img" aria-label={`${caption} ${value}%`}>
      <path d={arc(1)} stroke="#141B23" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={arc(Math.max(0.001, value / 100))} stroke="#22D38A" strokeWidth="10" fill="none" strokeLinecap="round" />
      <text x="66" y="70" className="big">{value}%</text>
      <text x="66" y="88" className="cap">{caption}</text>
    </svg>
  );
}

/** 상태별 개수를 한 줄 구간으로. counts = { live, mock, planned, next } */
export function StatusBar({ counts }) {
  return (
    <div className="seg">
      {STATUS_ORDER.filter((k) => counts[k]).map((k) => <span key={k} style={{ flex: counts[k], background: STATUS[k].color }} />)}
    </div>
  );
}

/** 작은 꺾은선. 마지막 값에 점. */
export function Sparkline({ series, color = '#2FD3E6', width = 84, height = 26 }) {
  const mx = Math.max(1, ...series), dx = width / (series.length - 1);
  const y = (v) => (height - 2 - (v / mx) * (height - 4)).toFixed(1);
  const points = series.map((v, i) => `${(i * dx).toFixed(1)},${y(v)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={width} cy={y(series[series.length - 1])} r="2" fill={color} />
    </svg>
  );
}

/** 영역 차트. series를 채우고 compare를 점선으로 겹친다. days는 YYYY-MM-DD 배열. */
export function AreaChart({ series, compare, days, compareLabel = '점선 = 전체 변경' }) {
  const w = 360, h = 60;
  const path = (s) => {
    const m = Math.max(1, ...s);
    return s.map((v, i) => `${i ? 'L' : 'M'}${((i * w) / (s.length - 1)).toFixed(1)} ${(h - 4 - (v / m) * (h - 12)).toFixed(1)}`).join(' ');
  };
  const id = React.useId().replace(/:/g, '');
  return (
    <>
      <svg className="area" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="14일 변경 추이">
        <defs>
          <linearGradient id={`ag${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2FD3E6" stopOpacity=".35" />
            <stop offset="1" stopColor="#2FD3E6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {compare && <path d={path(compare)} fill="none" stroke="#3A4450" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <path d={`${path(series)} L${w} ${h} L0 ${h}Z`} fill={`url(#ag${id})`} />
        <path d={path(series)} fill="none" stroke="#2FD3E6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="axis"><span>{md(days[0])}</span>{compare && <span>{compareLabel}</span>}<span>{md(days[days.length - 1])}</span></div>
    </>
  );
}
