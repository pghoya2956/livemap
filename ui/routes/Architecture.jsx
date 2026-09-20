// 구조 화면(#/architecture[/<초점>[/<기능>]][?level=&split=&show=]).
// 한 대시보드이고 상태가 넷이다 — 초점(sys › 부품 › 묶음 › 층 › 파일 › 함수), 기능, 수준(파일·함수), 나눔(사람이 그린 것·코드가 보이는 것).
// 넷 모두 location.hash 에 실리고(SC-9) 선택으로 window.scrollY 를 바꾸지 않는다(SC-10). 배치는 좌우이고 그림마다 자기 상자에서 스크롤한다.
// 뷰 고르는 규칙(스펙 「화면 모델」 뷰 표): 시스템 그림은 항상, 아래는 초점 sys·기능 없음이면 나눔이 층 요약과 묶음 개요를 가르고 그 밖은 층 배치다.
import React from 'react';
import { Screen, Empty } from './common.jsx';
import { Panel, Icons, Chip, Proj } from '../components/primitives.jsx';
import { SystemMap } from '../components/SystemMap.jsx';
import { LaneMap, LaneSummary } from '../components/LaneMap.jsx';
import { CommunityMap } from '../components/CommunityMap.jsx';
import { ImpactPanel } from '../components/ImpactPanel.jsx';
import { PathPanel } from '../components/PathPanel.jsx';
import { archHash } from '../lib/route.js';
import { flowPath, neighbors, laneName, isSymbolId } from '../lib/arch.js';

const HUB_MIN = 8;

/** 초점 여섯 단계의 빵부스러기. 위로 올라가는 단계만 링크로 둔다 */
function Crumbs({ arch, focus, fn, go }) {
  const parts = [{ label: '시스템', focus: 'sys' }];
  const nameC = (id) => (arch.containers || []).find((c) => c.id === id)?.name ?? id;
  const nameL = (id) => laneName((arch.lanes || []).find((l) => l.id === id)) || id;
  const nameM = (id) => (arch.communities || []).find((c) => c.id === id)?.name ?? `묶음 ${id}`;
  if (focus?.startsWith('part:')) parts.push({ label: nameC(focus.slice(5)), focus });
  else if (focus?.startsWith('community:')) parts.push({ label: nameM(Number(focus.slice(10))), focus });
  else if (focus?.startsWith('group:')) {
    const l = (arch.lanes || []).find((x) => x.id === focus.slice(6));
    if (l?.container) parts.push({ label: nameC(l.container), focus: `part:${l.container}` });
    parts.push({ label: nameL(focus.slice(6)), focus });
  } else if (focus && focus !== 'sys') {
    // 여섯째 단계(함수)면 그 심볼이 속한 파일을 다섯째 칸으로 끼워 넣는다. 빵부스러기로 한 단계씩 올라와야 한다(SC-9)
    const sym = isSymbolId(fn, focus) ? fn.symbols.find((x) => x.id === focus) : null;
    const fileId = sym ? sym.module : focus;
    const m = (arch.modules || []).find((x) => x.id === fileId);
    if (m?.container) parts.push({ label: nameC(m.container), focus: `part:${m.container}` });
    if (m?.community != null) parts.push({ label: nameM(m.community), focus: `community:${m.community}` });
    parts.push({ label: fileId.split('/').pop(), focus: fileId });
    if (sym) parts.push({ label: focus.slice(sym.module.length + 1), focus });
  }
  return (
    <nav className="am-crumbs" aria-label="초점">
      {parts.map((p, i) => (
        <React.Fragment key={p.focus}>
          {i > 0 && <span className="sep" aria-hidden="true">›</span>}
          {i === parts.length - 1
            ? <span className="on" aria-current="step"><Proj>{p.label}</Proj></span>
            : <button type="button" className="am-link" onClick={() => go({ focus: p.focus })}><Proj>{p.label}</Proj></button>}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Architecture({ ov, data, params }) {
  const arch = data.architecture || null;
  const { focus = 'sys', flow = null, level = 'file', split = 'human', show = [] } = params || {};
  const [fnData, setFnData] = React.useState(undefined); // undefined 아직 안 받음 · null 없음 · 객체 받음
  const [bundle, setBundle] = React.useState(null);
  const [expanded, setExpanded] = React.useState(false);

  // 수준을 함수로 처음 바꿀 때 architecture.json 을 한 번 받아오고 그 뒤 재사용한다(DEC-39). 파일이 없으면 파일 수준에 머문다
  React.useEffect(() => {
    if (level !== 'fn' || fnData !== undefined) return;
    let live = true;
    fetch('data/architecture.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setFnData(j))
      .catch(() => live && setFnData(null));
    return () => { live = false; };
  }, [level, fnData]);

  // 초점·기능·수준·나눔을 해시에 싣는다. 선택으로 스크롤을 옮기지 않는다(SC-10)
  const go = React.useCallback((patch) => {
    const next = { focus, flow, level, split, show, ...patch };
    const hash = archHash(next);
    if (`#${location.hash.replace(/^#/, '')}` !== hash) history.pushState(null, '', hash);
    dispatchEvent(new HashChangeEvent('hashchange'));
  }, [focus, flow, level, split, show]);
  const onFocus = React.useCallback((f) => { setBundle(null); setExpanded(false); go({ focus: f || 'sys' }); }, [go]);
  const onFlow = React.useCallback((f) => go({ flow: f || null }), [go]);
  const toggleShow = (k) => go({ show: show.includes(k) ? show.filter((x) => x !== k) : [...show, k].sort() });

  if (!arch) {
    return (
      <Screen ov={ov} screen="architecture" nav={2} title="구조">
        <Empty>구조 자료가 없습니다. graphify 어댑터를 설정하고 <code>map/architecture/</code> 에 선언을 적으면 여기 섭니다.</Empty>
      </Screen>
    );
  }

  // 뷰 고르는 규칙(스펙 「화면 모델」 뷰 표 + OQ-11 결정 focus):
  //  초점 sys · 기능 없음이면 나눔이 층 요약(사람이 그린 것)과 묶음 개요(코드가 보이는 것)를 가른다.
  //  묶음을 골랐을 때도 나눔이 「코드가 보이는 것」이면 묶음 개요에 머문다 — 결정이 "상자를 고르면 그 묶음에 닿는 선만 진하게"라
  //  그림이 사라지면 강조를 볼 자리가 없다. 그 묶음의 층 배치는 나눔을 「사람이 그린 것」으로 바꿔 본다. 그 밖은 모두 층 배치다
  const isSys = focus === 'sys' && !flow;
  const inCommunityMap = split === 'code' && !flow && (focus === 'sys' || focus.startsWith('community:'));
  const view = inCommunityMap ? 'community' : isSys ? 'lanes' : 'nodes';
  const hiddenLanes = show.includes('lanes') ? [] : (arch.lanes || []).filter((l) => l.visible === false).map((l) => l.id);
  const mockLanes = show.includes('nomock') ? (arch.lanes || []).filter((l) => l.id === 'mock' || l.kind === 'mock').map((l) => l.id) : [];
  const hidden = [...hiddenLanes, ...mockLanes];
  const fp = flow ? flowPath(arch, flow) : null;
  const near = React.useMemo(() => {
    if (!focus || /^(sys|part:|community:|group:)/.test(focus)) return new Set();
    const n = neighbors(arch, focus);
    return new Set([...n.in, ...n.out]);
  }, [arch, focus]);


  const viewWord = { lanes: '층 요약', community: '묶음 개요', nodes: '층 배치' }[view];
  const lanesVisible = (arch.lanes || []).filter((l) => !hidden.includes(l.id) && l.visible !== false).length;
  const sub = `부품 ${(arch.containers || []).length} · 층 ${lanesVisible} · 묶음 ${(arch.communities || []).length} · 파일 ${(arch.modules || []).length} · 기능 ${(arch.flows || []).length} · 어긋남 ${(arch.violations || []).length}`;

  return (
    <Screen ov={ov} screen="architecture" nav={2} title="구조" sub={sub}>
      <div className="am-top">
        <Crumbs arch={arch} focus={focus} fn={level === 'fn' && fnData ? fnData : null} go={go} />
        <div className="am-toggles">
          <span className="am-tg" role="group" aria-label="수준">
            {[['file', '파일'], ['fn', '함수·컴포넌트']].map(([k, w]) => (
              <Chip key={k} on={level === k} onClick={() => go({ level: k })}>{w}</Chip>
            ))}
          </span>
          <span className="am-tg" role="group" aria-label="나눔">
            {[['human', '사람이 그린 것'], ['code', '코드가 보이는 것']].map(([k, w]) => (
              <Chip key={k} on={split === k} onClick={() => go({ split: k })}>{w}</Chip>
            ))}
          </span>
          <span className="am-tg" role="group" aria-label="보이기">
            <Chip on={show.includes('tests')} onClick={() => toggleShow('tests')}>검사</Chip>
            <Chip on={show.includes('lanes')} onClick={() => toggleShow('lanes')}>숨긴 층</Chip>
            <Chip on={!show.includes('nomock')} onClick={() => toggleShow('nomock')}>목업</Chip>
            {view === 'community' && <Chip className="am-thin" on={show.includes('thin')} onClick={() => toggleShow('thin')}>드문 선 숨김</Chip>}
          </span>
          {flow && <Chip on onClick={() => onFlow(null)}>기능 <Proj>{fp?.name ?? flow}</Proj> ✕</Chip>}
        </div>
      </div>
      {arch.graphMissing && <p className="am-warn">Graphify 그래프 없음 — 부품과 기존 사슬 두 층까지만 그린다. <code>map/config.json</code> 의 <code>architecture.graph</code> 를 설정하면 파일·묶음까지 선다.</p>}
      {level === 'fn' && fnData === null && <p className="am-warn">함수 수준 자료 없음 — <code>map/.out/architecture.json</code> 이 없어 파일 수준에 머문다.</p>}

      <div className="am-grid">
        <div className="am-col-l">
          <Panel icon={Icons.map} title="시스템 그림" sub="경계 안 부품과 실측 연결" budget="archmap" className="am-p">
            <SystemMap arch={arch} actors={Object.values(data.semantic?.actors || {})} flow={fp} focus={focus} onFocus={onFocus} />
          </Panel>
          <Panel icon={Icons.table} title={viewWord} sub={view === 'nodes' ? '열이 층 순서 · 상자를 누르면 더 내려간다' : view === 'community' ? '구역 안 묶음 · 상자를 누르면 닿는 선이 진해진다. 그 묶음의 층 배치는 나눔을 바꿔 본다' : '층마다 상자 하나 · 「열기」로 그 층 안으로'} budget="archmap" className="am-p">
            {view === 'lanes' && <LaneSummary arch={arch} hidden={hidden} focus={focus} onFocus={onFocus} />}
            {view === 'community' && <CommunityMap arch={arch} focus={focus} onFocus={onFocus} hideTests={!show.includes('tests')} thin={show.includes('thin')} />}
            {view === 'nodes' && (
              // 수준이 함수이고 자료를 받았을 때만 함수 수준으로 그린다. null(파일 없음)·undefined(받는 중)는 파일 수준에 머문다
              <LaneMap arch={arch} focus={focus} flow={flow} hidden={hidden} hubMin={HUB_MIN} neighbourIds={near}
                fn={level === 'fn' && fnData ? fnData : null}
                onFocus={(id) => { const l = id && String(id); if (l) onFocus(l); }} />
            )}
          </Panel>
        </div>
        <div className="am-col-r">
          <ImpactPanel arch={arch} focus={focus} bundle={bundle} fn={level === 'fn' && fnData ? fnData : null} onFocus={onFocus} onFlow={onFlow} expanded={expanded} onExpand={setExpanded} />
          <PathPanel arch={arch} flow={flow} onFlow={onFlow} onFocus={onFocus} journeys={data.semantic?.journeys || []} />
        </div>
      </div>
    </Screen>
  );
}
