// 마지막 방문 기록. localStorage 키 map:lastVisit(1.0.1과 같음). 커밋 시각에 +09:00과 Z가 섞여 문자열 비교는 틀리므로 Date.parse로 비교한다.
const KEY = 'map:lastVisit';

/** a가 b보다 뒤 시각인지. 어느 쪽이든 읽지 못하면 false. */
export const isNewer = (a, b) => {
  const x = Date.parse(a), y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x > y;
};

export function readLastVisit() {
  try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; }
}

export function stampVisit(now = new Date()) {
  try { globalThis.localStorage?.setItem(KEY, now.toISOString()); } catch { /* 저장소를 못 쓰면 기록하지 않는다 */ }
}

/** 1.0.1처럼 페이지를 떠날 때와 60초 뒤에 방문을 기록한다. 해제 함수를 돌려준다. */
export function installVisitStamp(win = globalThis) {
  const onHide = () => stampVisit();
  win.addEventListener?.('pagehide', onHide);
  const t = setTimeout(onHide, 60000);
  return () => { win.removeEventListener?.('pagehide', onHide); clearTimeout(t); };
}
