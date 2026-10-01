// 개요 조각 검사: overviewSlice 새 필드(SC-10 마일스톤·로드맵 항목, 활동·변경·연결·캡처)와 1.0.1 키 유지.
// 캡처는 1.3.0부터 기능당 최대 5장·전체 상한 없음·기능 안 파일 중복 제거다(SC-9, DEC-23).
// 픽스처 mini를 git 밖 임시 폴더에서 파생한 data.json에 커밋·여정·로드맵을 바꿔 끼운다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';
import { derive, overviewSlice } from '../src/derive.mjs';
import { readSemantic } from '../src/cli.mjs';
import { makeWorkspace } from './helpers/workspace-fixture.mjs';

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

const capturesOf = (js) => overviewSlice({ ...withData({}), semantic: { ...data.semantic, journeys: js } }).captures;

test('captures: 동작 단계만, 캡처 파일이 있는 단계만, 기능·단계 순서, journey·step은 id(1.3.0 규칙)', () => {
  const js = [
    journey('c1', [step('a', 'mock', 'm.jpg'), step('b', 'live', 'one.jpg'), step('c', 'live', 'two.jpg')]),
    journey('c2', [step('a', 'live', 'one.jpg'), step('b', 'live', 'three.jpg')]),
    journey('c3', [step('a', 'live')]),
    ...['c4', 'c5', 'c6', 'c7'].map((id) => journey(id, [step('a', 'live', `${id}.jpg`)])),
  ];
  assert.deepEqual(capturesOf(js), [
    { file: 'one.jpg', journey: 'c1', step: 'b' }, { file: 'two.jpg', journey: 'c1', step: 'c' },
    { file: 'one.jpg', journey: 'c2', step: 'a' }, { file: 'three.jpg', journey: 'c2', step: 'b' },
    { file: 'c4.jpg', journey: 'c4', step: 'a' }, { file: 'c5.jpg', journey: 'c5', step: 'a' }, { file: 'c6.jpg', journey: 'c6', step: 'a' }, { file: 'c7.jpg', journey: 'c7', step: 'a' },
  ]);
});

test('SC-9 captures: 한 기능에 동작 + 캡처 단계가 둘이면 둘 다 실리고, 기능 안에서 같은 파일은 한 번', () => {
  const cap = capturesOf([journey('k', [step('a', 'live', 'home.jpg'), step('b', 'live', 'home.jpg'), step('c', 'live', 'list.jpg')])]);
  assert.deepEqual(cap, [{ file: 'home.jpg', journey: 'k', step: 'a' }, { file: 'list.jpg', journey: 'k', step: 'c' }]);
});

test('SC-9 captures: 두 기능이 같은 캡처 파일을 가리키면 둘 다 실린다(전역 중복 제거를 하지 않는다)', () => {
  const cap = capturesOf([journey('p', [step('a', 'live', 'detail.jpg')]), journey('q', [step('a', 'mock', 'x.jpg'), step('b', 'live', 'detail.jpg')])]);
  assert.deepEqual(cap, [{ file: 'detail.jpg', journey: 'p', step: 'a' }, { file: 'detail.jpg', journey: 'q', step: 'b' }]);
});

test('SC-9 captures: 한 기능의 캡처가 6장이면 단계 순서로 앞 5장만 실린다', () => {
  const cap = capturesOf([journey('six', ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => step(id, 'live', `${id}.jpg`))), journey('one', [step('a', 'live', 'o.jpg')])]);
  assert.deepEqual(cap.filter((c) => c.journey === 'six').map((c) => c.step), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(cap.filter((c) => c.journey === 'one').map((c) => c.file), ['o.jpg']);
});

test('SC-9 captures: 기능이 5개를 넘어도 전체가 잘리지 않는다', () => {
  const ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'];
  const cap = capturesOf(ids.map((id) => journey(id, [step('a', 'live', `${id}-1.jpg`), step('b', 'live', `${id}-2.jpg`)])));
  assert.equal(cap.length, 14);
  assert.deepEqual([...new Set(cap.map((c) => c.journey))], ids);
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

test('SC-11 signals.boundaryViolations: 구조 절이 있으면 어긋남 수 하나, 없으면 null. 개요에 묶음 이름·파일 경로는 싣지 않는다', () => {
  // 구조 절이 없는 자료(graphify 어댑터 미설정): 전광판·특보에 줄이 서지 않게 null
  const { architecture: _mini, ...noArch } = data;
  assert.equal(overviewSlice(noArch).signals.boundaryViolations, null);
  // mini 픽스처는 구조 절이 있고 어긋남 0이다
  assert.equal(overviewSlice(data).signals.boundaryViolations, 0);
  const vio = [{ code: 'architecture.layer-violation', from: 'a', to: 'b', at: { file: 'app/server.mjs', line: 4 } }];
  const withArch = {
    ...data,
    summary: { ...data.summary, containers: 2, modules: 3, communities: 2, flows: 1, boundaryViolations: vio.length },
    architecture: { status: 'ok', containers: [{ id: 'web', name: '웹' }], lanes: [], laneLinks: [], communities: [{ id: 1, name: 'Pay.tsx', zone: 'web', nodes: 2, visible: true }], communityLinks: [], modules: [{ id: 'web/src/pages/Pay.tsx' }], flows: [], violations: vio },
  };
  const o = overviewSlice(withArch);
  assert.equal(o.signals.boundaryViolations, 1);
  // 개요 조각 어디에도 묶음 이름·파일 경로가 없다(개요 식별자 검사가 .tsx·.mjs·.sql·web/src 를 찾는다)
  const text = JSON.stringify(o);
  for (const bad of ['Pay.tsx', 'web/src', 'app/server.mjs', 'architecture.layer-violation']) assert.equal(text.includes(bad), false, bad);
  // 구조 절만 있고 어긋남이 0이면 0이다(null 이 아니다)
  assert.equal(overviewSlice({ ...withArch, summary: { ...withArch.summary, boundaryViolations: 0 }, architecture: { ...withArch.architecture, violations: [] } }).signals.boundaryViolations, 0);
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

// ── 워크스페이스(2.2.0) ──
test('워크스페이스 개요: repos 는 상위 + 자식의 여덟 키만, 제품 축이 비면 productEmpty, 어긋남 수는 signals.reposDrift', async () => {
  const W = await makeWorkspace({ dir });
  const { data: wd } = await buildGraph(W);
  const o = overviewSlice(wd);
  assert.deepEqual(o.repos.map((r) => Object.keys(r)), Array(3).fill(['name', 'role', 'build', 'commits', 'running', 'stepsLive', 'stepsTotal', 'drift']));
  assert.deepEqual(o.repos.map((r) => [r.name, r.build, r.commits, r.running, r.drift]), [['Workspace', 'ok', 1, 1, 0], ['app', 'ok', 1, 1, 0], ['svc', 'ok', 1, 0, 0]]);
  assert.deepEqual([o.repos[1].stepsLive, o.repos[1].stepsTotal], [0, 0]);
  assert.equal(o.productEmpty, true);
  assert.equal(o.signals.reposDrift, 0);
  // 개요에는 HEAD·상황판 주소·경로가 없다(개요 식별자 검사)
  const text = JSON.stringify(o.repos);
  for (const bad of ['example.test', 'head', 'board', 'path']) assert.equal(text.includes(bad), false, bad);
  for (const r of wd.repos.slice(1)) assert.equal(text.includes(r.head), false, r.head);
  // 빌드하지 못한 자식의 동작 단계는 모름(null)
  const broken = overviewSlice({ ...wd, repos: wd.repos.map((r) => (r.name === 'app' ? { ...r, build: 'failed', summary: null } : r)) });
  assert.deepEqual([broken.repos[1].build, broken.repos[1].stepsLive], ['failed', null]);
});

test('워크스페이스 뷰 행: 작업·결정·커밋·장부에 repo(상위 "."), 작업은 접두를 뗀 이름 순이고 같은 이름이면 상위가 먼저', async () => {
  const W = await makeWorkspace({ dir });
  const { data: wd } = await buildGraph(W);
  for (const k of ['tasks', 'decisions', 'commits']) assert.ok(wd[k].length && wd[k].every((x) => typeof x.repo === 'string'), k);
  assert.ok([...wd.ledger.running, ...wd.ledger.waiting].every((x) => typeof x.repo === 'string'));
  assert.deepEqual(wd.tasks.map((t) => [t.name, t.repo]), [
    ['app:20260103-app-only', 'app'], ['20260102-parent-only', '.'], ['20260101-shared', '.'], ['app:20260101-shared', 'app'],
  ]);
  assert.deepEqual(wd.decisions.map((x) => [x.slug, x.repo]), [['app:app-choice', 'app']]);
  // 워크스페이스가 아닌 프로젝트는 repo 를 싣지 않는다(산출이 2.1.x 와 같다)
  assert.ok(data.tasks.every((t) => !('repo' in t)) && data.commits.every((c) => !('repo' in c)) && data.decisions.every((x) => !('repo' in x)));
  const o = overviewSlice(data);
  for (const k of ['repos', 'productEmpty']) assert.equal(k in o, false, k);
  assert.equal('reposDrift' in o.signals, false);
});

test('위키 결정 단계 참조 수는 같은 저장소의 같은 파일만 센다', async () => {
  const d0 = mkdtempSync(join(dir, 'refs-'));
  cpSync(join(HERE, 'fixtures', 'mini'), d0, { recursive: true });
  const { g, cfg, fs } = await buildGraph(d0);
  // 자식 저장소에 같은 상대 경로의 결정 파일이 있다
  g.add('decision', 'app:sample', '자식 결정', { kind: 'wiki', file: '.agent/wiki/decisions/sample.md', status: 'current', summary: 'x', repo: 'app' });
  const d = derive(g, readSemantic(fs, cfg), cfg, { captureExists: () => null, repos: [{ path: '.' }] });
  const refs = Object.fromEntries(d.decisions.map((x) => [x.slug, x.refs]));
  assert.ok(refs.sample >= 1);
  assert.equal(refs['app:sample'], 0);
});
