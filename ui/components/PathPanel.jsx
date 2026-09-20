// 길 패널: 여정별 기능 목록과 고른 기능의 길. 맨 위 이야기 한 줄은 제품 오너가 첫 화면에서 읽는 문장이라 코드 이름을 넣지 않는다.
// 고른 기능은 층별 노드 목록(파일과 줄, 검사 수)과 요약으로 편다. 코드에서 끊긴 자리는 "끊김"으로 표시한다(SC-14).
import React from 'react';
import { Panel, Icons, Proj, StepMark } from './primitives.jsx';
import { flowPath } from '../lib/arch.js';

const KIND_WORD = { screen: '화면', module: '파일', symbol: '함수', api: 'API', auth: '로그인', function: 'DB 함수', table: '테이블' };
const COUNT_WORD = [['screen', '화면'], ['file', '파일'], ['api', 'API'], ['auth', '로그인'], ['fn', 'DB 함수'], ['table', '테이블']];

/**
 * arch: architecture 절, flow: 고른 기능 id, onFlow: 기능 고르기, onFocus: 초점 바꾸기
 * journeys: data.semantic.journeys(여정별 묶음과 단계 intent)
 */
export function PathPanel({ arch, flow, onFlow, onFocus, journeys = [] }) {
  const flows = arch.flows || [];
  const f = flow ? flowPath(arch, flow) : null;
  const stepOf = React.useMemo(() => {
    const m = new Map();
    for (const j of journeys) for (const s of j.steps || []) m.set(`${j.id}/${s.id}`, { journey: j, step: s });
    return m;
  }, [journeys]);

  if (!flows.length) {
    return (
      <Panel icon={Icons.map} title="길" sub="기능 없음" className="am-panel">
        <p className="am-note">선언 폴더에 흐름을 적으면 기능의 길이 여기 선다. <code>{arch.declaration?.dir || 'map/architecture'}/README.md</code></p>
      </Panel>
    );
  }

  if (!f) {
    // 여정별 기능 목록: 상태 칩과 화면·API 수
    const byJourney = new Map();
    for (const x of flows) {
      const s = stepOf.get(x.step || '');
      const key = s ? s.journey.id : '';
      if (!byJourney.has(key)) byJourney.set(key, { journey: s?.journey ?? null, list: [] });
      byJourney.get(key).list.push(x);
    }
    return (
      <Panel icon={Icons.map} title="길" sub={`기능 ${flows.length}`} className="am-panel">
        {[...byJourney.values()].map((g, i) => (
          <div key={g.journey?.id ?? `-${i}`}>
            <div className="am-sec"><Proj>{g.journey?.title ?? '여정 밖'}</Proj></div>
            <div className="am-list">
              {g.list.map((x) => (
                <button key={x.id} type="button" className="am-row am-link" onClick={() => onFlow?.(x.id)}>
                  <span className="am-chipst"><StepMark status={x.status === 'live' ? 'live' : x.status === 'mock' ? 'mock' : 'planned'} size={10} /></span>
                  <Proj>{x.name}</Proj>
                  <span className="n">화면 {x.counts?.screen ?? 0} · API {x.counts?.api ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Panel>
    );
  }

  const s = stepOf.get(f.step || '');
  const summary = COUNT_WORD.filter(([k]) => f.counts[k] != null).map(([k, w]) => `${w} ${f.counts[k]}`).join(' · ');
  return (
    <Panel icon={Icons.map} title="길" sub={<Proj>{f.name}</Proj>} className="am-panel">
      <p className="am-story"><Proj>{f.name}</Proj> · {f.status === 'live' ? '동작' : f.status === 'mock' ? '목업' : f.status}. <Proj>{f.story}</Proj></p>
      {s && <p className="am-intent"><Proj>{s.step.label}</Proj>{s.step.intent ? <> · <Proj>{s.step.intent}</Proj></> : null}</p>}
      <button type="button" className="chip am-clear" onClick={() => onFlow?.(null)}>기능 고르기 풀기</button>
      <div className="am-sec">요약</div>
      <p className="am-sum">{summary} · 노드 {f.nodes.length}{f.broken.length ? ` · 끊김 ${f.broken.length}` : ''}</p>
      <div className="am-sec">선언 좌표 사슬</div>
      <div className="am-list">
        {f.chain.map((e, i) => (
          <div key={i} className={`am-row${e.broken ? ' bad' : ''}`}>
            <Proj>{e.fromRef} → {e.toRef}</Proj>
            {e.broken && <span className="n warn">끊김</span>}
          </div>
        ))}
        {!f.chain.length && <span className="dim">좌표 사슬이 한 칸이라 선이 없다</span>}
      </div>
      <div className="am-sec">층별 노드 {f.nodes.length}</div>
      {f.byLane.map((g) => (
        <div key={g.lane || '-'} className="am-lanegrp">
          <div className="am-lanename"><Proj>{g.name}</Proj> <span className="n">{g.nodes.length}</span></div>
          <div className="am-list">
            {g.nodes.map((x) => (
              <button key={x.id} type="button" className="am-row am-link" onClick={() => onFocus?.(x.id)}>
                <span className="dim">{KIND_WORD[x.kind] ?? x.kind}</span> <Proj>{x.kind === 'module' || x.kind === 'symbol' ? x.id.split('/').pop() : x.id}</Proj>
                {x.module?.symbols != null && <span className="n">함수 {x.module.symbols}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}
