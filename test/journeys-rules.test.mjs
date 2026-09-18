// 여정 정본 검사 규칙(PN-33): 하위 유형 어휘, 넘김 짝, 시작 지점, 사용자 확인 뒤 변경.
// 규칙마다 어긋난 fixture로 먼저 실패를 보고, 고친 fixture로 사라지는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProblems } from '../src/check.mjs';

const role = ({ slug, reviewedAt = '2026-09-17', startStep = 'a/one', subtypes = [], handoffs = [], changedAfterReview = false }) => ({
  slug, file: `docs/${slug}.md`, reviewedAt, startStep, subtypes, handoffs, changedAfterReview,
});

const step = (id, extra = {}) => ({
  id, label: id, intent: '뜻', status: 'live', screens: [], screenNodes: [{ source: 'live', path: '/x' }],
  apiNodes: [], functionNodes: [], testFiles: ['tests/x.spec.mjs'], refNodes: [], taskNames: [], warnings: [], grade: 'B',
  subtypes: [], handoffs: [], ...extra,
});

const data = ({ roles, journeys }) => ({
  semantic: { actors: { diver: '다이버', resort: '리조트' }, statusLegend: {}, roles, journeys },
  screens: [], apis: [], functions: [], tests: [], migrations: [], tasks: [], roadmap: [], milestones: [],
  adapters: [], ledger: { running: [], waiting: [] }, decisions: [], plans: [], commits: [],
  summary: { grades: {}, routes: 0, apis: 0, dbFunctions: 0 }, deploy: null,
  orphans: { screens: [], apis: [], tests: [], functions: [] }, coverage: {}, issues: [], judgments: [], readings: {},
});

const codes = (d) => checkProblems(d, { floors: {} }).map((p) => p.code);

test('단계의 하는 사람이 역할 파일 하위 유형 표에 없으면 경고다', () => {
  const roles = [role({ slug: 'diver', subtypes: [{ name: '방문자', start: 'a/one' }] })];
  const journeys = [{ id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['방문자'] })] }];
  assert.ok(!codes(data({ roles, journeys })).includes('journey.subtype-unknown'));

  const bad = [{ id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['스태프'] })] }];
  const problems = checkProblems(data({ roles, journeys: bad }), { floors: {} });
  const hit = problems.find((p) => p.code === 'journey.subtype-unknown');
  assert.ok(hit, '없는 하위 유형은 journey.subtype-unknown');
  assert.match(hit.msg, /스태프/);
});

test('넘김이 가리키는 단계가 없으면 오류, 받는 역할이 넘겨받는 일에 안 적었으면 경고다', () => {
  // 정본 규칙: 역할을 건너가는 단계는 여정을 시작한 역할이 소유하고, 받는 역할 파일은 `넘겨받는 일`에 같은 ID를 둔다.
  // 받는 역할이 그 단계를 이미 소유하면(자기 여정의 단계) 따로 적지 않는다.
  const journeys = [
    { id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['방문자'], handoffs: [{ role: '리조트', step: 'a/two' }] })] },
    { id: 'a2', title: 'A2', actor: 'diver', steps: [step('two')] },
  ];
  journeys[1].id = 'a'; // 같은 여정의 다음 단계를 리조트가 받는다(소유는 다이버 파일)
  const unpaired = [role({ slug: 'diver', subtypes: [{ name: '방문자', start: 'a/one' }] }), role({ slug: 'resort', startStep: 'a/one', handoffs: [] })];
  const warn = checkProblems(data({ roles: unpaired, journeys }), { floors: {} }).find((p) => p.code === 'journey.handoff-unpaired');
  assert.ok(warn, '받는 역할 파일에 짝이 없으면 경고');

  const paired = [role({ slug: 'diver', subtypes: [{ name: '방문자', start: 'a/one' }] }), role({ slug: 'resort', startStep: 'a/one', handoffs: ['a/two'] })];
  assert.ok(!codes(data({ roles: paired, journeys })).includes('journey.handoff-unpaired'));

  const owned = [
    { id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['방문자'], handoffs: [{ role: '리조트', step: 'b/two' }] })] },
    { id: 'b', title: 'B', actor: 'resort', steps: [step('two')] },
  ];
  const noEntry = [role({ slug: 'diver', subtypes: [{ name: '방문자', start: 'a/one' }] }), role({ slug: 'resort', startStep: 'b/two', handoffs: [] })];
  assert.ok(!codes(data({ roles: noEntry, journeys: owned })).includes('journey.handoff-unpaired'), '받는 역할이 소유한 단계는 적지 않아도 된다');

  const dangling = [
    { id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['방문자'], handoffs: [{ role: '리조트', step: 'b/없음' }] })] },
    { id: 'b', title: 'B', actor: 'resort', steps: [step('two')] },
  ];
  const err = checkProblems(data({ roles: noEntry, journeys: dangling }), { floors: {} }).find((p) => p.code === 'journey.handoff-missing-step');
  assert.ok(err, '없는 단계로 넘기면 오류');
  assert.equal(err.level, 'error');
});

test('시작 지점이 실제 단계 ID가 아니면 오류다', () => {
  const roles = [role({ slug: 'diver', startStep: 'a/없음', subtypes: [{ name: '방문자', start: 'a/one' }] })];
  const journeys = [{ id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['방문자'] })] }];
  const hit = checkProblems(data({ roles, journeys }), { floors: {} }).find((p) => p.code === 'journey.start-unknown');
  assert.ok(hit);
  assert.equal(hit.level, 'error');
  assert.match(hit.msg, /a\/없음/);
});

test('역할 파일이 사용자 확인 뒤에 바뀌었으면 경고다', () => {
  const roles = [role({ slug: 'diver', subtypes: [{ name: '방문자', start: 'a/one' }], changedAfterReview: true })];
  const journeys = [{ id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['방문자'] })] }];
  const hit = checkProblems(data({ roles, journeys }), { floors: {} }).find((p) => p.code === 'journey.doc-changed-after-review');
  assert.ok(hit);
  assert.match(hit.msg, /2026-09-17/);
});

test('역할 정보가 없는 프로젝트(1.x JSON 여정)에서는 이 규칙들이 돌지 않는다', () => {
  const journeys = [{ id: 'a', title: 'A', actor: 'diver', steps: [step('one', { subtypes: ['스태프'] })] }];
  const list = codes(data({ roles: [], journeys }));
  assert.ok(!list.some((c) => c.startsWith('journey.subtype') || c.startsWith('journey.handoff') || c.startsWith('journey.start') || c.startsWith('journey.doc')));
});

test('읽을 역할 파일이 있는데 여정이 0건이면 오류다(빈 목록끼리 통과하지 않게)', () => {
  const d = data({ roles: [], journeys: [] });
  d.semantic.readEmpty = 'docs/product/journeys에 역할 파일 4개가 있는데 읽힌 여정이 0건';
  const withPath = checkProblems(d, { floors: {}, semantic: 'docs/product/journeys' });
  const hit = withPath.find((p) => p.code === 'semantic.empty');
  assert.ok(hit, '여정 0건은 semantic.empty');
  assert.equal(hit.level, 'error');

  const fresh = data({ roles: [], journeys: [] }); // 여정을 아직 안 쓴 프로젝트
  assert.ok(!checkProblems(fresh, { floors: {}, semantic: 'map/semantic/journeys.json' }).find((p) => p.code === 'semantic.empty'));
});

test('바닥값으로 단계 수를 지킬 수 있다', () => {
  const journeys = [{ id: 'a', title: 'A', actor: 'x', steps: [step('one', { testFiles: ['t'] })] }];
  const d = data({ roles: [], journeys });
  const hit = checkProblems(d, { floors: { step: 5 }, semantic: 'docs/product/journeys' }).find((p) => p.code === 'floor.below');
  assert.ok(hit, '단계 수가 바닥값 아래면 floor.below');
  assert.match(hit.msg, /step/);
});
