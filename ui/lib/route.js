// 해시 라우트 풀기. JSX 없는 모듈이라 단위 검사가 import한다.
// 1.0.1 패턴: 빈 해시·#/overview, #/journeys[/<id>[/<step>]], #/roadmap[/<id>], #/tasks[/<name>], #/changes(더보기 변화 별칭),
// #/more[/<tab>[/<detail>]](기본 탭 decisions), 알 수 없는 경로는 개요이고 내비 선택이 없다.
export const NAV = ['overview', 'journeys', 'roadmap', 'tasks', 'more'];
export const MORE_TABS = ['changes', 'decisions', 'screens', 'backend', 'tests', 'about'];

/** 해시 → { screen, nav, params }. nav는 선택할 내비 순번(알 수 없는 경로는 -1). */
export function parseRoute(hash = '') {
  const raw = String(hash).replace(/^#\/?/, '');
  let parts;
  try { parts = raw.split('/').map(decodeURIComponent); } catch { return unknown(); }
  const [head, a, b] = parts;
  const at = (screen, params = {}) => ({ screen, nav: NAV.indexOf(screen), params });
  if (!head || head === 'overview') return parts.length <= 1 ? at('overview') : unknown();
  if (head === 'journeys' && parts.length <= 3) return at('journeys', { journey: a || null, step: a ? b || null : null });
  if (head === 'roadmap' && parts.length <= 2) return at('roadmap', { id: a || null });
  if (head === 'tasks' && parts.length <= 2) return at('tasks', { task: a || null });
  if (head === 'changes' && parts.length === 1) return at('more', { tab: 'changes', detail: null });
  if (head === 'more' && parts.length <= 3 && (!a || MORE_TABS.includes(a))) return at('more', { tab: a || 'decisions', detail: a ? b || null : null });
  return unknown();
}
const unknown = () => ({ screen: 'overview', nav: -1, params: {}, unknown: true });
