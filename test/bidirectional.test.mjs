// 정본↔검사 양방향(PN-34, md 정본을 읽는 프로젝트에서만 돈다): 동작·목업 단계마다 지나는 검사가 있어야 하고(오류, 대응표에 이유가 있으면 면제),
// 검사가 지나는데 어느 단계에도 없는 라우트는 경고다. 미착수·다음 단계는 검사가 없어도 오류가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProblems } from '../src/check.mjs';

const step = (id, status, extra = {}) => ({
  id, label: id, intent: '뜻', status, screens: ['/x'], screenNodes: [{ source: 'live', path: '/x', tests: [] }],
  apiNodes: [], functionNodes: [], testFiles: [], refNodes: [], taskNames: [], warnings: [], grade: null,
  subtypes: [], handoffs: [], ...extra,
});

const data = (journeys, extra = {}) => ({
  semantic: { actors: {}, statusLegend: {}, roles: [{ slug: 'x', file: 'docs/x.md', subtypes: [], handoffs: [], startStep: '' }], journeys },
  screens: [], apis: [], functions: [], tests: [], migrations: [], tasks: [], roadmap: [], milestones: [],
  adapters: [], ledger: { running: [], waiting: [] }, decisions: [], plans: [], commits: [],
  summary: { grades: {}, routes: 0, apis: 0, dbFunctions: 0 }, deploy: null,
  orphans: { screens: [], apis: [], tests: [], functions: [] }, coverage: {}, issues: [], judgments: [], readings: {},
  ...extra,
});

const find = (d, code) => checkProblems(d, { floors: {} }).find((p) => p.code === code);

test('동작 단계에 지나는 검사가 없으면 오류다', () => {
  const d = data([{ id: 'a', title: 'A', actor: 'x', steps: [step('one', 'live')] }]);
  const hit = find(d, 'step.no-test');
  assert.ok(hit, '검사 없는 동작 단계는 step.no-test');
  assert.equal(hit.level, 'error');
  assert.match(hit.msg, /one/);
});

test('검사가 하나라도 있으면 오류가 아니다', () => {
  const d = data([{ id: 'a', title: 'A', actor: 'x', steps: [step('one', 'live', { testFiles: ['tests/a.spec.mjs'] })] }]);
  assert.ok(!find(d, 'step.no-test'));
});

test('미착수·다음 단계는 검사가 없어도 오류가 아니다', () => {
  const d = data([{ id: 'a', title: 'A', actor: 'x', steps: [step('one', 'planned'), step('two', 'next')] }]);
  assert.ok(!find(d, 'step.no-test'));
});

test('대응표에 검사 없는 이유를 적으면 면제하고 그 이유를 싣는다', () => {
  const d = data([{ id: 'a', title: 'A', actor: 'x', steps: [step('one', 'mock', { noTest: '목업 화면이라 흐름 검사가 없다' })] }]);
  assert.ok(!find(d, 'step.no-test'));
});

test('검사가 지나는데 어느 단계에도 없는 라우트는 경고다', () => {
  const d = data(
    [{ id: 'a', title: 'A', actor: 'x', steps: [step('one', 'live', { testFiles: ['tests/a.spec.mjs'] })] }],
    { orphans: { screens: ['/orphan', '/lonely'], apis: [], tests: [], functions: [] },
      screens: [{ path: '/orphan', tests: ['tests/a.spec.mjs'] }, { path: '/lonely', tests: [] }] },
  );
  const hit = find(d, 'tests.route-not-in-journey');
  assert.ok(hit, '검사가 지나는 고아 라우트는 경고');
  assert.match(hit.msg, /\/orphan/);
  assert.ok(!hit.msg.includes('/lonely'), '검사가 없는 고아 라우트는 기존 orphan.screens가 센다');
});
