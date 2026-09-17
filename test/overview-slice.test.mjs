// 개요 조각 검사: overviewSlice 새 필드(SC-10 마일스톤·로드맵 항목, 활동·변경·연결·캡처)와 1.0.1 키 유지.
// 픽스처 mini를 git 밖 임시 폴더에서 파생한 data.json에 커밋·여정·로드맵을 바꿔 끼운다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';
import { overviewSlice } from '../src/derive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'livemap 개요 검사-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
cpSync(join(HERE, 'fixtures', 'mini'), dir, { recursive: true });
const { data } = await buildGraph(dir);
// 1.0.1 overview.json 키(골든 1.0.1 픽스처 빌드에서 뽑음). 값 포함 대조는 golden.test.mjs가 한다
const KEYS_101 = {
  top: ['generatedAt', 'project', 'headDate', 'line', 'journeys', 'running', 'roadmap', 'roadmapDone', 'roadmapTotal', 'waiting', 'tasks', 'signals', 'counts', 'areas', 'recent', 'openQuestions'],
  counts: ['stepsLive', 'stepsTotal', 'screensLive', 'screensFixed', 'screens', 'apis', 'functions', 'tests', 'pnDone', 'pnTotal', 'oq', 'decisions', 'proposed', 'grades'],
  signals: ['deploy', 'deployBehind', 'tests', 'lastRun', 'adapters', 'adapterNotes', 'warnings', 'orphans', 'gated'],
};

const step = (id, status, captureFile = null) => ({ id, label: `단계 ${id}`, status, grade: status === 'live' ? 'C' : null, warnings: [], captureFile });
const journey = (id, steps, status = 'partial') => ({ id, title: `기능 ${id}`, actor: 'u', lane: 'L', goal: `**목표** ${id}`, status, counts: { live: 0, mock: 0, planned: 0, next: 0 }, steps, warnings: 0 });
const JOURNEYS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'].map((id) => journey(id, [step('a', 'live'), step('b', 'mock')]));
const touch = (...ids) => ids.map((x) => { const [journey, st = 'a'] = x.split('/'); return { journey, step: st, label: x }; });
const commit = (date, subject, journeys = [], extra = {}) => ({ sha: 'x', date, author: '사람', subject, runtime: false, journeys, ...extra });
const withData = (patch) => ({ ...data, generatedAt: '2026-09-17T03:00:00.000Z', semantic: { ...data.semantic, journeys: JOURNEYS }, ...patch });

test('activity: 봇 분리, Asia/Seoul 날짜 묶음, 창 밖 제외, opts 없으면 14일', () => {
  const d = withData({ commits: [
    commit('2026-09-16T15:30:00Z', 'feat: 자정 넘김', [], { runtime: true }),
    commit('2026-09-16T23:59:00+09:00', 'fix: 자정 전'),
    commit('2026-09-10T01:00:00Z', 'chore: 봇', [], { author: 'dependabot[bot]', runtime: true }),
    commit('2026-09-03T14:59:00Z', 'docs: 창 밖(9.3 23:59 KST)'),
    commit('2026-09-03T15:00:00Z', 'docs: 창 첫날(9.4 00:00 KST)'),
  ] });
  const a = overviewSlice(d).activity;
  assert.equal(a.sinceDays, 14);
  assert.equal(a.days.length, 14);
  assert.deepEqual([a.days[0].date, a.days[13].date], ['2026-09-04', '2026-09-17']);
  const by = Object.fromEntries(a.days.map((x) => [x.date, [x.commits, x.runtime, x.bots]]));
  assert.deepEqual([by['2026-09-17'], by['2026-09-16'], by['2026-09-10'], by['2026-09-04']], [[1, 1, 0], [1, 0, 0], [0, 0, 1], [1, 0, 0]]);
  assert.deepEqual([a.total, a.runtime, a.bots], [3, 1, 1]);
  assert.equal(overviewSlice(d, { sinceDays: 7 }).activity.days.length, 7);
  assert.equal(overviewSlice(d, { sinceDays: 7 }).activity.total, 2);
});

test('changes: Date.parse 내림차순 최대 20, 봇 제외, 종류·정리한 제목·기능 최대 3과 나머지 수', () => {
  const many = Array.from({ length: 24 }, (_, i) => commit(`2026-09-${String(10 + (i % 7)).padStart(2, '0')}T0${i % 10}:00:00Z`, `docs: 기록 ${i}`));
  const d = withData({ commits: [
    ...many,
    commit('2026-09-17T09:00:00+09:00', 'feat: PN-3 가장 늦음', touch('j5', 'j1', 'j3', 'j2', 'j1/b')),
    commit('2026-09-17T00:30:00Z', 'deploy: 45cb747', [], { author: 'ci[bot]' }),
    commit('2026-09-16T23:59:00Z', 'fix: 두 번째'),
  ] });
  const c = overviewSlice(d).changes;
  assert.equal(c.length, 20);
  assert.deepEqual(c[0], { date: '2026-09-17T00:00:00.000Z', kind: '기능', subject: '가장 늦음', journeys: ['기능 j1', '기능 j2', '기능 j3'], journeysMore: 1 });
  assert.deepEqual([c[1].subject, c[1].date, c[1].journeysMore], ['두 번째', '2026-09-16T23:59:00.000Z', 0]);
  for (let i = 1; i < c.length; i++) assert.ok(Date.parse(c[i - 1].date) >= Date.parse(c[i].date));
});

test('links: 기능 2개 이상·기능 수 절반 이하인 커밋의 쌍만, n 내림차순', () => {
  const d = withData({ commits: [
    commit('2026-09-15T01:00:00Z', 'feat: 둘', touch('j2', 'j1')),
    commit('2026-09-15T02:00:00Z', 'feat: 둘 다시', touch('j1', 'j2', 'j1/b')),
    commit('2026-09-15T03:00:00Z', 'feat: 셋', touch('j1', 'j2', 'j3')),
    commit('2026-09-15T04:00:00Z', 'feat: 넷(절반 초과)', touch('j1', 'j2', 'j3', 'j4')),
    commit('2026-09-15T05:00:00Z', 'feat: 하나', touch('j5')),
    commit('2026-09-15T06:00:00Z', 'chore: 봇', touch('j5', 'j6'), { author: 'x[bot]' }),
  ] });
  assert.deepEqual(overviewSlice(d).links, [{ a: 'j1', b: 'j2', n: 3 }, { a: 'j1', b: 'j3', n: 1 }, { a: 'j2', b: 'j3', n: 1 }]);
});

test('journeys: 1.0.1 키에 목표·집계·커밋 수·계열을 더하고 단계는 hits만 더한다', () => {
  const d = withData({ commits: [
    commit('2026-09-17T01:00:00Z', 'feat: a', touch('j1', 'j1/b')),
    commit('2026-09-16T01:00:00Z', 'feat: b', touch('j1')),
    commit('2026-09-05T01:00:00Z', 'feat: c', touch('j1/b')),
    commit('2026-09-05T02:00:00Z', 'chore: 봇', touch('j1'), { author: 'x[bot]' }),
  ] });
  const j = overviewSlice(d).journeys[0];
  assert.deepEqual(Object.keys(j), ['id', 'title', 'actor', 'lane', 'status', 'warnings', 'steps', 'goal', 'counts', 'roadmapItem', 'milestone', 'commits', 'week', 'series']);
  assert.deepEqual(j.steps.map((s) => Object.keys(s)), [['id', 'label', 'status', 'grade', 'warn', 'hits'], ['id', 'label', 'status', 'grade', 'warn', 'hits']]);
  assert.deepEqual(j.steps.map((s) => s.hits), [2, 2]);
  assert.deepEqual([j.goal, j.commits, j.week, j.series.length, j.series[13], j.series[12], j.series[1]], ['목표 j1', 3, 2, 14, 1, 1, 1]);
  assert.equal(overviewSlice(d).journeys[1].commits, 0);
});

test('captures: 동작 단계만, 기능당 하나, 같은 파일은 한 번, 최대 5, journey·step은 id', () => {
  const js = [
    journey('c1', [step('a', 'mock', 'm.jpg'), step('b', 'live', 'one.jpg'), step('c', 'live', 'two.jpg')]),
    journey('c2', [step('a', 'live', 'one.jpg'), step('b', 'live', 'three.jpg')]),
    journey('c3', [step('a', 'live')]),
    ...['c4', 'c5', 'c6', 'c7'].map((id) => journey(id, [step('a', 'live', `${id}.jpg`)])),
  ];
  const cap = overviewSlice({ ...withData({}), semantic: { ...data.semantic, journeys: js } }).captures;
  assert.deepEqual(cap, [{ file: 'one.jpg', journey: 'c1', step: 'b' }, { file: 'three.jpg', journey: 'c2', step: 'b' }, { file: 'c4.jpg', journey: 'c4', step: 'a' }, { file: 'c5.jpg', journey: 'c5', step: 'a' }, { file: 'c6.jpg', journey: 'c6', step: 'a' }]);
});

// 로드맵 항목·마일스톤(data.json 모양)
const scene = (ref, status) => { const [journey, st] = ref.split('/'); return { ref, journey, step: st, status }; };
const rItem = (id, order, status, extra = {}) => ({ id, order, title: `항목 ${id}`, status, mode: '계획', goal: '', waitingOn: '', done: '', deps: [], scenes: [], tasks: [], progress: { live: 0, total: 0, fixed: 0 }, problems: [], src: null, milestone: null, completedAt: null, waitingSince: null, waitingWho: null, waitingWhat: '', blockedBy: [], ...extra });
const rMs = (id, order, status, extra = {}) => ({ id, order, title: `마일스톤 ${id}`, status, goal: '', completedOn: null, targetOn: null, waitingOn: '', waitingWho: null, waitingWhat: '', waitingSince: null, items: [], progress: { live: 0, total: 0 }, plans: { done: 0, total: 0 }, blocked: false, problems: [], warnings: [], src: null, ...extra });

test('SC-10 roadmapItems: order 순, 키 고정, 문구는 비완료 항목만', () => {
  const d = withData({ roadmap: [
    rItem('b', 2, '진행', { goal: `[긴](x) ${'가'.repeat(150)}`, waitingOn: '사용자: **순서** 결정', waitingSince: '2026-09-15T12:43:09.000Z', milestone: 'one', scenes: [scene('j1/a', 'live'), scene('j1/b', 'mock'), { ref: 'j9/z', missing: true }], tasks: [{ name: 't1', title: `작업 ${'나'.repeat(70)}`, stage: '실행', status: '대기', pnDone: 1, pnOpen: 2 }, { name: 'gone', missing: true }], blockedBy: ['waiting', 'task'] }),
    rItem('a', 1, '완료', { goal: '끝난 목표', waitingOn: '남은 대기', waitingSince: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-02T00:00:00.000Z', milestone: 'ghost' }),
  ], milestones: [rMs('one', 1, '진행', { items: ['b'] })] });
  const [a, b] = overviewSlice(d).roadmapItems;
  assert.deepEqual(Object.keys(a), ['id', 'order', 'title', 'status', 'mode', 'milestone', 'goal', 'waitingOn', 'waitingWho', 'waitingWhat', 'waitingSince', 'completedAt', 'sceneCounts', 'tasks', 'blockedBy']);
  assert.deepEqual([a.id, a.goal, a.waitingOn, a.waitingWho, a.waitingWhat, a.waitingSince, a.completedAt, a.milestone], ['a', '', '', null, '', null, '2026-09-02T00:00:00.000Z', null]);
  assert.equal([...b.goal].length, 140);
  assert.ok(b.goal.startsWith('긴 가'));
  assert.deepEqual([b.waitingOn, b.waitingWho, b.waitingWhat, b.waitingSince, b.milestone], ['사용자: 순서 결정', '사용자', '순서 결정', '2026-09-15T12:43:09.000Z', 'one']);
  assert.deepEqual(b.sceneCounts, { live: 1, mock: 1, planned: 0, next: 0 });
  assert.deepEqual(b.tasks, [{ name: 't1', title: `작업 ${'나'.repeat(56)}…`, stage: '실행', status: '대기', pnDone: 1, pnOpen: 2 }]);
  assert.deepEqual(b.blockedBy, ['waiting', 'task']);
});

test('SC-10 milestones·currentMilestone: 원소 키, 진행 → 다음 → null, 기능의 로드맵 항목·마일스톤', () => {
  const roadmap = [
    rItem('x', 1, '완료', { scenes: [scene('j2/a', 'live')], milestone: 'done' }),
    rItem('y', 2, '다음', { scenes: [scene('j2/b', 'mock')], milestone: 'two' }),
    rItem('z', 3, '진행', { scenes: [scene('j2/a', 'live'), scene('j3/a', 'live')] }),
  ];
  const ms = [
    rMs('done', 1, '완료', { completedOn: '2026-09-01', targetOn: '9월', items: ['x'] }),
    rMs('two', 2, '다음', { goal: '**목표**', waitingOn: '운영: 날짜 확정', waitingWho: '운영', waitingWhat: '날짜 확정', waitingSince: '2026-09-10T00:00:00.000Z', items: ['y'], progress: { live: 0, total: 1 }, plans: { done: 1, total: 3 }, blocked: true }),
    rMs('three', 3, '진행'),
  ];
  const o = overviewSlice(withData({ roadmap, milestones: ms }));
  assert.deepEqual(Object.keys(o.milestones[0]), ['id', 'order', 'title', 'status', 'goal', 'completedOn', 'targetOn', 'waitingWho', 'waitingWhat', 'waitingSince', 'items', 'steps', 'plans', 'blocked']);
  assert.deepEqual(o.milestones[0].targetOn, null);
  assert.deepEqual(o.milestones[1], { id: 'two', order: 2, title: '마일스톤 two', status: '다음', goal: '목표', completedOn: null, targetOn: null, waitingWho: '운영', waitingWhat: '날짜 확정', waitingSince: '2026-09-10T00:00:00.000Z', items: ['y'], steps: { live: 0, total: 1 }, plans: { done: 1, total: 3 }, blocked: true });
  assert.equal(o.currentMilestone, 'three');
  assert.equal(overviewSlice(withData({ roadmap, milestones: ms.slice(0, 2) })).currentMilestone, 'two');
  assert.equal(overviewSlice(withData({ roadmap, milestones: ms.slice(0, 1) })).currentMilestone, null);
  const byId = Object.fromEntries(o.journeys.map((j) => [j.id, [j.roadmapItem, j.milestone]]));
  assert.deepEqual(byId.j2, [{ id: 'y', title: '항목 y', status: '다음' }, { id: 'two', title: '마일스톤 two', status: '다음' }]);
  assert.deepEqual(byId.j3, [{ id: 'z', title: '항목 z', status: '진행' }, null]);
  assert.deepEqual(byId.j1, [null, null]);
});

test('counts·signals 새 키와 1.0.1 키 유지, roadmap[] 원소 키는 1.0.1과 같다', () => {
  const o = overviewSlice(data);
  assert.deepEqual(o.counts.steps, { live: 1, mock: 1, planned: 1, next: 0 });
  assert.deepEqual([o.counts.journeys, o.counts.journeysLive, o.counts.tasksRunning], [1, 0, 1]);
  assert.equal(o.signals.deployBehindAll, null);
  assert.equal(o.signals.deployBehindAll, data.deploy?.behind ?? null);
  for (const k of KEYS_101.top) assert.ok(k in o, k);
  for (const k of KEYS_101.counts) assert.ok(k in o.counts, `counts.${k}`);
  for (const k of KEYS_101.signals) assert.ok(k in o.signals, `signals.${k}`);
  assert.equal(o.roadmap.length, 2);
  assert.deepEqual(Object.keys(o.roadmap[0]), ['id', 'title', 'status', 'mode', 'live', 'total', 'waiting']);
});
