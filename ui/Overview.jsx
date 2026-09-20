// 첫 화면 조립. data는 overview.json 1.1.0 필드(스펙 「데이터 모델」)와 1.2.0 counts.openQuestions·counts.reading.
import React from 'react';
import { Panel, Icons } from './components/primitives.jsx';
import { FeatureMap } from './components/FeatureMap.jsx';
import { TopBar, Ticker, MilestonePanel, ProgressPanel, ChangesPanel, FeatureTrendPanel, SignalsPanel, CapturePanel, FeatureTablePanel } from './components/panels.jsx';
import { hm, sum } from './lib/format.js';
import { mapJourneys } from './lib/fit.js';
import { readLastVisit } from './lib/visit.js';
import { readingText, whyText, unsure } from './lib/reading.js';

/** 개요 수치 하나: 읽기 상태가 부분·낡음·모름이면 값 뒤 "?"와 이유 분류(파일·줄 없음). 상태가 없으면 값 그대로. */
const readItem = (label, value, field, reading) => {
  const st = reading?.[field];
  return unsure(st) ? { label, value: readingText(value, st), extra: whyText(field, st) } : { label, value };
};

/** 전광판 항목. 규모 숫자는 1.0.1 counts, 로드맵이 없으면 "로드맵 완료"를 뺀다.
 * 열린 질문은 1.2.0 counts.openQuestions(답이 없는 질문, DEC-12)이고 없으면 1.1.1 oq다. */
export function tickerItems(d) {
  const c = d.counts, steps = c.steps, total = sum(Object.values(steps));
  const days = d.activity.days;
  const done = d.roadmapItems.filter((r) => r.status === '완료').length;
  return [
    { label: '동작 단계', value: `${steps.live}/${total}`, extra: `${total ? Math.round((steps.live / total) * 100) : 0}%` },
    { label: '완성 기능', value: `${c.journeysLive}/${c.journeys}` },
    ...(d.roadmapItems.length ? [{ label: '로드맵 완료', value: `${done}/${d.roadmapItems.length}` }] : []),
    { label: '14일 변경', value: d.activity.total, extra: `최근 3일 ${sum(days.slice(-3).map((x) => x.commits))}` },
    { label: '자동 커밋', value: d.activity.bots },
    { label: '제품 코드 변경', value: d.activity.runtime },
    { label: '실데이터 화면', value: `${c.screensLive}/${c.screens}` },
    { label: 'API', value: c.apis }, { label: 'DB 함수', value: c.functions }, readItem('자동 검사', c.tests, 'tests', c.reading),
    ...(d.signals.boundaryViolations == null ? [] : [{ label: '구조 어긋남', value: d.signals.boundaryViolations }]),
    { label: '확정 결정', value: c.decisions }, readItem('열린 질문', c.openQuestions ?? c.oq, 'openQuestions', c.reading),
    ...d.journeys.map((j) => ({ label: j.title, project: true, value: `${j.counts.live}/${j.steps.length}`, extra: `변경 ${j.commits}` })),
  ];
}

/** current: 선택할 내비 순번(알 수 없는 경로는 -1) */
export function Overview({ data: d, captureBase, current = 0 }) {
  const firstIncomplete = d.journeys.find((j) => j.status !== 'live') || d.journeys[0];
  const [selected, setSelected] = React.useState(firstIncomplete?.id);
  // 사용자가 기능 지도·기능 추세·기능 표 어디서든 기능을 눌렀는지. 초기 선택은 고른 것이 아니다(DEC-24·DEC-40)
  const [userPicked, setUserPicked] = React.useState(false);
  const pick = (id) => { setSelected(id); setUserPicked(true); };
  const at = `${hm(d.generatedAt)} 기준`;
  const next = d.roadmapItems.find((r) => r.status !== '완료' && r.status !== '진행') || null;
  const cur = d.milestones.find((m) => m.id === d.currentMilestone) || null;
  const lastVisit = React.useMemo(readLastVisit, []);
  const onMap = React.useMemo(() => mapJourneys(d.journeys, d.currentMilestone), [d.journeys, d.currentMilestone]);
  return (
    <div className="screen" data-screen="overview">
      <TopBar project={d.project} signals={d.signals} generatedAt={d.generatedAt} current={current} />
      <Ticker items={tickerItems(d)} />
      <main className="grid">
        <div className="col l">
          <MilestonePanel roadmapItems={d.roadmapItems} milestones={d.milestones} currentMilestone={d.currentMilestone} generatedAt={d.generatedAt} tasksRunning={d.counts.tasksRunning} at={at} />
          <ProgressPanel steps={d.counts.steps} journeysLive={d.counts.journeysLive} journeysTotal={d.counts.journeys} milestone={cur} at={at} />
          <ChangesPanel changes={d.changes} activity={d.activity} generatedAt={d.generatedAt} lastVisit={lastVisit} at={at} />
        </div>
        <div className="col c">
          <Panel icon={Icons.map} title="기능 지도" sub={`기능 ${d.counts.journeys} · 단계 ${sum(Object.values(d.counts.steps))}`} at={at} budget="matrix">
            <FeatureMap journeys={onMap.shown} badgeJourneys={d.journeys} folded={onMap.folded} foldedIncomplete={onMap.foldedIncomplete}
              links={d.links} selected={selected} onSelect={pick} stepCounts={d.counts.steps} next={next} />
          </Panel>
          <div className="split">
            <FeatureTrendPanel journeys={d.journeys} selected={selected} onSelect={pick} at={at} />
            <SignalsPanel roadmapItems={d.roadmapItems} milestones={d.milestones} signals={d.signals} generatedAt={d.generatedAt} at={at} />
          </div>
        </div>
        <div className="col r">
          <CapturePanel captures={d.captures} journeys={d.journeys} base={captureBase} selected={selected} userPicked={userPicked} />
          <FeatureTablePanel journeys={d.journeys} activity={d.activity} selected={selected} onSelect={pick} />
        </div>
      </main>
    </div>
  );
}
