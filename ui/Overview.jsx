// 첫 화면 조립. data는 livemap 생성물에서 계산한 모니터 자료(프리뷰 derive와 같은 모양).
import React from 'react';
import { Panel, Icons } from './components/primitives.jsx';
import { FeatureMap } from './components/FeatureMap.jsx';
import { TopBar, Ticker, RoadmapPanel, ProgressPanel, ChangesPanel, FeatureTrendPanel, SignalsPanel, CapturePanel, FeatureTablePanel } from './components/panels.jsx';
import { hm, sum } from './lib/format.js';

export function tickerItems(d) {
  const A = d.activity, sz = d.size;
  const pct = d.stepsTotal ? Math.round((d.steps.live / d.stepsTotal) * 100) : 0;
  return [
    { label: '동작 단계', value: `${d.steps.live}/${d.stepsTotal}`, delta: `${pct}%`, trend: 'up' },
    { label: '완성 기능', value: `${d.journeysLive}/${d.journeysTotal}` },
    { label: '로드맵 완료', value: `${d.roadmap.filter((r) => r.status === '완료').length}/${d.roadmap.length}` },
    { label: '14일 변경', value: A.sum, delta: `▲ 최근 3일 ${sum(A.total.slice(-3))}`, trend: 'up' },
    { label: '제품 코드 변경', value: A.runtimeSum },
    { label: '실데이터 화면', value: `${sz.screensLive}/${sz.screens}` },
    { label: 'API', value: sz.apis }, { label: 'DB 함수', value: sz.functions }, { label: '자동 검사', value: sz.tests },
    { label: '확정 결정', value: sz.decisions }, { label: '열린 질문', value: sz.oq, trend: 'fl' },
    ...d.journeys.map((j) => ({ label: j.title, value: `${j.counts.live}/${j.steps.length}`, delta: j.week ? `▲ ${j.week}` : '—', trend: j.week ? 'up' : 'fl' })),
  ];
}

export function Overview({ data: d }) {
  const [selected, setSelected] = React.useState(() => (d.journeys.find((j) => j.status !== 'live') || d.journeys[0])?.id);
  const at = `${hm(d.generatedAt)} 기준`;
  const nextR = d.roadmap.find((r) => r.status !== '완료' && r.status !== '진행');
  return (
    <>
      <TopBar project={d.project} signals={d.signals} />
      <Ticker items={tickerItems(d)} />
      <main className="grid">
        <div className="col l">
          <RoadmapPanel roadmap={d.roadmap} tasks={d.tasks} at={at} />
          <ProgressPanel steps={d.steps} total={d.stepsTotal} journeysLive={d.journeysLive} journeysTotal={d.journeysTotal} at={at} />
          <ChangesPanel changes={d.changes} total={d.activity.sum} refIso={d.generatedAt} at={at} />
        </div>
        <div className="col c">
          <Panel icon={Icons.map} title="기능 지도" sub={`기능 ${d.journeysTotal} · 단계 ${d.stepsTotal}`} at={at}>
            <FeatureMap journeys={d.journeys} links={d.links} selected={selected} onSelect={setSelected} stepCounts={d.steps}
              nextNote={nextR ? `다음 · ${nextR.title}${nextR.waitingOn ? ' · 결정 대기' : ''} ›` : null} />
          </Panel>
          <div className="split">
            <FeatureTrendPanel journeys={d.journeys} selected={selected} onSelect={setSelected} at={at} />
            <SignalsPanel roadmap={d.roadmap} journeys={d.journeys} activity={d.activity} changes={d.changes} refIso={d.generatedAt} at={at} />
          </div>
        </div>
        <div className="col r">
          <CapturePanel captures={d.captures} />
          <FeatureTablePanel journeys={d.journeys} activity={d.activity} selected={selected} onSelect={setSelected} />
        </div>
      </main>
    </>
  );
}
