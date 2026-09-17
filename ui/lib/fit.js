// 목록 맞춤: 패널 안에서 스크롤로 숨지 않게, 고정 행 높이로 들어가는 행 수(최대 6)를 정한다.
import React from 'react';

export const fitCount = (available, rowHeight, total, max = 6) => Math.max(0, Math.min(max, total, Math.floor(available / rowHeight)));

export function useFitRows(total, rowHeight, max = 6) {
  const ref = React.useRef(null);
  const [n, setN] = React.useState(Math.min(max, total));
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const calc = () => setN(fitCount(el.clientHeight, rowHeight, total, max));
    calc();
    const ro = new ResizeObserver(calc); ro.observe(el);
    return () => ro.disconnect();
  }, [total, rowHeight, max]);
  return [ref, n];
}

/**
 * 기능 지도에 올릴 기능(최대 max). 미완성 기능(파일 순서) → 현재 마일스톤의 완성 기능 → 나머지 완성 기능(14일 커밋 내림차순).
 * shown은 파일 순서, folded는 올리지 못한 수, foldedIncomplete는 미완성 기능만으로 max를 넘었는지.
 */
export function mapJourneys(journeys, currentMilestone = null, max = 12) {
  if (journeys.length <= max) return { shown: journeys, folded: 0, foldedIncomplete: false };
  const idx = new Map(journeys.map((j, i) => [j.id, i]));
  const incomplete = journeys.filter((j) => j.status !== 'live');
  const done = journeys.filter((j) => j.status === 'live');
  const inCur = done.filter((j) => currentMilestone && j.milestone?.id === currentMilestone);
  const rest = done.filter((j) => !inCur.includes(j)).sort((a, b) => b.commits - a.commits || idx.get(a.id) - idx.get(b.id));
  const picked = new Set([...incomplete, ...inCur, ...rest].slice(0, max));
  return { shown: journeys.filter((j) => picked.has(j)), folded: journeys.length - picked.size, foldedIncomplete: incomplete.length > max };
}
