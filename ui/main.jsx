// 엔진 화면 진입점: 해시 라우터. 개요는 data/overview.json, 하위 화면은 처음 들어갈 때 data/data.json을 한 번 더 읽는다.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Overview } from './Overview.jsx';
import { Journeys } from './routes/Journeys.jsx';
import { Architecture } from './routes/Architecture.jsx';
import { Roadmap } from './routes/Roadmap.jsx';
import { Tasks } from './routes/Tasks.jsx';
import { More } from './routes/More.jsx';
import { parseRoute } from './lib/route.js';
import { installVisitStamp } from './lib/visit.js';

const SCREENS = { journeys: Journeys, architecture: Architecture, roadmap: Roadmap, tasks: Tasks, more: More };
const load = (name) => fetch(`data/${name}.json`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
let overviewP = null, dataP = null;
const getOverview = () => (overviewP ||= load('overview'));
const getData = () => (dataP ||= load('data'));

function useHash() {
  const [hash, setHash] = React.useState(() => location.hash);
  React.useEffect(() => { const on = () => setHash(location.hash); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return hash;
}

/** 경로 이동 뒤 스크롤: 로드맵 항목·마일스톤(details는 연다), 단계 상세는 가까이, 그 밖은 맨 위.
 *  로드맵은 가까이(nearest)만 옮긴다. 고른 항목 카드가 트리 바로 아래 상세 슬롯에 있어 맨 위로 맞추면 누른 트리가 화면 밖으로 밀린다.
 *  구조 화면은 초점·기능·수준·나눔이 모두 해시라 경로가 자주 바뀐다. 선택으로 스크롤을 옮기지 않는다(SC-10). */
function scrollFor(route) {
  const { screen, params } = route;
  if (screen === 'architecture') return;
  if (screen === 'roadmap' && params.id) {
    const el = document.getElementById(`rm-${params.id}`);
    if (el) {
      const det = el.tagName === 'DETAILS' ? el : el.closest('details');
      if (det) det.open = true;
      el.scrollIntoView({ block: 'nearest' });
      return;
    }
  } else if (screen === 'journeys' && params.step) {
    const d = document.querySelector('.detail');
    if (d) { d.scrollIntoView({ block: 'nearest' }); return; }
  }
  window.scrollTo(0, 0);
}

function App() {
  const hash = useHash();
  const route = React.useMemo(() => parseRoute(hash), [hash]);
  const [state, setState] = React.useState({ ov: null, data: null, error: false });
  const needData = route.screen !== 'overview';
  React.useEffect(() => {
    let live = true;
    Promise.all([getOverview(), needData ? getData() : null])
      .then(([ov, data]) => live && setState((s) => ({ ov, data: data || s.data, error: false })))
      .catch(() => live && setState((s) => ({ ...s, error: true })));
    return () => { live = false; };
  }, [needData]);
  React.useEffect(() => installVisitStamp(), []);
  const ready = !state.error && state.ov && (!needData || state.data);
  React.useLayoutEffect(() => { if (ready) scrollFor(route); }, [ready, hash]);

  if (state.error) return <p className="boot boot-error">불러오지 못했습니다. 생성물이 없으면 npm run map 을 먼저 실행하세요.</p>;
  if (!ready) return <p className="boot">불러오는 중…</p>;
  if (route.screen === 'overview') return <Overview data={state.ov} current={route.nav} />;
  const View = SCREENS[route.screen];
  return <View ov={state.ov} data={state.data} params={route.params} />;
}

createRoot(document.getElementById('root')).render(<App />);
