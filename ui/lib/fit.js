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
