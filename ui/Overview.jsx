// 첫 화면 조립. data는 overview.json 1.1.0 필드(스펙 「데이터 모델」).
import React from 'react';
import { Panel, Icons } from './components/primitives.jsx';
import { FeatureMap } from './components/FeatureMap.jsx';
import { TopBar, Ticker, MilestonePanel, ProgressPanel, ChangesPanel, FeatureTrendPanel, SignalsPanel, CapturePanel, FeatureTablePanel } from './components/panels.jsx';
import { hm, sum } from './lib/format.js';

export function tickerItems(d) {
  const c = d.counts, steps = c.steps, total = sum(Object.values(steps));
  const days = d.activity.days;
  const done = d.roadmapItems.filter((r) => r.status === '완료').length;
  return [
    { label: '동작 단계', value: `${steps.live}/${total}`, extra: `${total ? Math.round((steps.live / total) * 100) : 0}%` },
    { label: '완성 기능', value: `${c.journeysLive}/${c.journeys}` },
    { label: '로드맵 완료', value: `${done}/${d.roadmapItems.length}` },
    { label: '14일 변경', value: d.activity.total, extra: `최근 3일 ${sum(days.slice(-3).map((x) => x.commits))}` },
    { label: '자동 커밋', value: d.activity.bots },
    { label: '제품 코드 변경', value: d.activity.runtime },
    { label: '실데이터 화면', value: `${d.size.screensLive}/${d.size.screens}` },
    { label: 'API', value: d.size.apis }, { label: 'DB 함수', value: d.size.functions }, { label: '자동 검사', value: d.size.tests },
    { label: '확정 결정', value: d.size.decisions }, { label: '열린 질문', value: d.size.oq },
    ...d.journeys.map((j) => ({ label: j.title, value: `${j.counts.live}/${j.steps.length}`, extra: `변경 ${j.commits}` })),
  ];
}

function lastVisitValue() { try { return localStorage.getItem('map:lastVisit'); } catch { return null; } }

export function Overview({ data: d, captureBase }) {
  const firstIncomplete = d.journeys.find((j) => j.status !== 'live') || d.journeys[0];
  const [selected, setSelected] = React.useState(firstIncomplete?.id);
  const at = `${hm(d.generatedAt)} 기준`;
  const next = d.roadmapItems.find((r) => r.status !== '완료' && r.status !== '진행');
  const cur = d.milestones.find((m) => m.id === d.currentMilestone) || null;
  const lastVisit = React.useMemo(lastVisitValue, []);
  return (
    <>
      <TopBar project={d.project} signals={d.signals} generatedAt={d.generatedAt} />
      <Ticker items={tickerItems(d)} />
      <main className="grid" id="root-main">
        <div className="col l">
          <MilestonePanel roadmapItems={d.roadmapItems} milestones={d.milestones} currentMilestone={d.currentMilestone} generatedAt={d.generatedAt} at={at} />
          <ProgressPanel steps={d.counts.steps} journeysLive={d.counts.journeysLive} journeysTotal={d.counts.journeys} milestone={cur} at={at} />
          <ChangesPanel changes={d.changes} activity={d.activity} generatedAt={d.generatedAt} lastVisit={lastVisit} at={at} />
        </div>
        <div className="col c">
          <Panel icon={Icons.map} title="기능 지도" sub={`기능 ${d.counts.journeys} · 단계 ${sum(Object.values(d.counts.steps))}`} at={at} budget="matrix">
            <FeatureMap journeys={d.journeys} links={d.links} selected={selected} onSelect={setSelected} stepCounts={d.counts.steps}
              nextNote={next ? `다음 · ${next.title}${next.waitingOn ? ` · ${next.waitingWho ? `${next.waitingWho} ` : ''}결정 대기` : ''} ›` : null} />
          </Panel>
          <div className="split">
            <FeatureTrendPanel journeys={d.journeys} selected={selected} onSelect={setSelected} at={at} />
            <SignalsPanel roadmapItems={d.roadmapItems} milestones={d.milestones} signals={d.signals} generatedAt={d.generatedAt} at={at} />
          </div>
        </div>
        <div className="col r">
          <CapturePanel captures={d.captures} base={captureBase} />
          <FeatureTablePanel journeys={d.journeys} activity={d.activity} selected={selected} onSelect={setSelected} />
        </div>
      </main>
    </>
  );
}
