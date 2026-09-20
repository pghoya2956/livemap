// 해시 라우트 풀기. JSX 없는 모듈이라 단위 검사가 import한다.
// 1.0.1 패턴: 빈 해시·#/overview, #/journeys[/<id>[/<step>]], #/roadmap[/<id>], #/tasks[/<name>], #/changes(더보기 변화 별칭),
// #/more[/<tab>[/<detail>]](기본 탭 decisions), 알 수 없는 경로는 개요이고 내비 선택이 없다.
// 2.1.0: #/architecture[/<초점>[/<기능>]][?level=&split=&show=] — 초점·기능·수준·나눔이 모두 해시에 실린다(SC-9).
export const NAV = ['overview', 'journeys', 'architecture', 'roadmap', 'tasks', 'more'];
export const MORE_TABS = ['changes', 'decisions', 'screens', 'backend', 'tests', 'about'];
export const ARCH_LEVELS = ['file', 'fn'];
export const ARCH_SPLITS = ['human', 'code'];

/** 해시 → { screen, nav, params }. nav는 선택할 내비 순번(알 수 없는 경로는 -1). */
export function parseRoute(hash = '') {
  const cut = String(hash).indexOf('?');
  const query = cut < 0 ? '' : String(hash).slice(cut + 1);
  const raw = (cut < 0 ? String(hash) : String(hash).slice(0, cut)).replace(/^#\/?/, '');
  let parts, q;
  try { parts = raw.split('/').map(decodeURIComponent); q = queryOf(query); } catch { return unknown(); }
  const [head, a, b] = parts;
  const at = (screen, params = {}) => ({ screen, nav: NAV.indexOf(screen), params });
  if (!head || head === 'overview') return parts.length <= 1 ? at('overview') : unknown();
  if (head === 'journeys' && parts.length <= 3) return at('journeys', { journey: a || null, step: a ? b || null : null });
  if (head === 'architecture' && parts.length <= 3) {
    return at('architecture', {
      focus: a || 'sys', flow: a ? b || null : null,
      level: ARCH_LEVELS.includes(q.level) ? q.level : 'file',
      split: ARCH_SPLITS.includes(q.split) ? q.split : 'human',
      show: q.show ? q.show.split(',').filter(Boolean) : [],
    });
  }
  if (head === 'roadmap' && parts.length <= 2) return at('roadmap', { id: a || null });
  if (head === 'tasks' && parts.length <= 2) return at('tasks', { task: a || null });
  if (head === 'changes' && parts.length === 1) return at('more', { tab: 'changes', detail: null });
  if (head === 'more' && parts.length <= 3 && (!a || MORE_TABS.includes(a))) return at('more', { tab: a || 'decisions', detail: a ? b || null : null });
  return unknown();
}
const unknown = () => ({ screen: 'overview', nav: -1, params: {}, unknown: true });
const queryOf = (s) => Object.fromEntries((s ? s.split('&') : []).filter(Boolean).map((kv) => { const i = kv.indexOf('='); return i < 0 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))]; }));

/** 구조 화면 해시 만들기. 기본값(초점 sys·기능 없음·파일 수준·사람이 그린 것·보이기 기본)은 적지 않는다. */
export function archHash({ focus = 'sys', flow = null, level = 'file', split = 'human', show = [] } = {}) {
  const seg = [encodeURIComponent(focus || 'sys')];
  if (flow) seg.push(encodeURIComponent(flow));
  const q = [];
  if (level !== 'file') q.push(`level=${encodeURIComponent(level)}`);
  if (split !== 'human') q.push(`split=${encodeURIComponent(split)}`);
  if (show.length) q.push(`show=${show.map(encodeURIComponent).join(',')}`);
  const path = focus === 'sys' && !flow ? '#/architecture' : `#/architecture/${seg.join('/')}`;
  return q.length ? `${path}?${q.join('&')}` : path;
}
