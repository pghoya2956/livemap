// 읽기 상태 모델 검사: 노드 props.reading·readingNotes 도우미, 합계 규칙, data.readings, overview.counts.reading.
// 필드별 규칙 채우기는 각 어댑터 몫이라 여기서는 프로젝트 어댑터가 상태를 붙인 mini 사본으로 합산만 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Graph } from '../src/lib/graph.mjs';
import { build } from '../src/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const MINI = join(HERE, 'fixtures', 'mini');
const READING = pathToFileURL(join(PKG, 'src', 'lib', 'reading.mjs')).href;
const VALUES = ['observed', 'rule', 'judged', 'partial', 'stale', 'unknown', 'none'];

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const readingModule = () => import('../src/lib/reading.mjs');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// mini 사본에 상태를 붙이는 프로젝트 어댑터(body)를 끝에 더해 build한 세 생성물
async function buildWith(body) {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 읽기 상태 검사-'));
  made.push(dir);
  cpSync(MINI, join(dir, 'p'), { recursive: true });
  const root = join(dir, 'p');
  if (body) {
    mkdirSync(join(root, 'map/adapters'), { recursive: true });
    writeFileSync(join(root, 'map/adapters/reads.mjs'), `import { setReading } from '${READING}';\nexport default function reads(g) {\n${body}\n  return null;\n}\n`);
    const cfgFile = join(root, 'map/config.json');
    const cfg = readJson(cfgFile);
    writeFileSync(cfgFile, JSON.stringify({ ...cfg, adapters: [...cfg.adapters, 'reads'] }, null, 2));
  }
  await build(root, join(dir, 'out'));
  return Object.fromEntries(['graph', 'data', 'overview'].map((f) => [f, readJson(join(dir, 'out', `${f}.json`))]));
}

test('읽기 상태 도우미: 노드 props.reading·readingNotes에 필드별로 더하고 값·필드 형식이 틀리면 throw', async () => {
  const { setReading, readingOf, READING_VALUES } = await readingModule();
  assert.deepEqual(READING_VALUES, VALUES);
  const g = new Graph();
  const node = g.add('task', 't1', '작업', { pnDone: 1 });
  setReading(node, 'plan', 'rule', '대체 규칙: notes.md');
  setReading(node, 'stage', 'unknown');
  assert.deepEqual(node.props.reading, { plan: 'rule', stage: 'unknown' });
  assert.deepEqual(node.props.readingNotes, { plan: '대체 규칙: notes.md' });
  // 같은 필드를 다시 적으면 값이 바뀐다. 이유 없이 다시 적으면 이전 이유를 지운다
  setReading(node, 'plan', 'judged');
  assert.deepEqual([node.props.reading.plan, node.props.readingNotes], ['judged', {}]);
  assert.equal(readingOf(node, 'plan'), 'judged');
  assert.equal(readingOf(node, 'openQuestions'), 'rule');
  assert.equal(readingOf(g.add('test', 'x.test.mjs', 'x'), 'count'), 'rule');
  assert.throws(() => setReading(node, 'plan', 'maybe'), /reading/);
  assert.throws(() => setReading(node, '', 'rule'), /reading/);
  assert.throws(() => setReading(node, 'plan', 'rule', 3), /reading/);
  assert.deepEqual(node.props.reading, { plan: 'judged', stage: 'unknown' });
});

test('SC-5 합계 규칙: 구성 요소 중 하나라도 partial·stale·unknown이면 partial, none은 빼고 센다', async () => {
  const { combineReading } = await readingModule();
  for (const bad of ['partial', 'stale', 'unknown']) {
    assert.equal(combineReading(['rule', 'observed', bad]), 'partial', bad);
    assert.equal(combineReading([bad, bad]), 'partial', bad);
  }
  assert.equal(combineReading(['rule', 'none', 'rule']), 'rule');
  assert.equal(combineReading(['observed', 'observed']), 'observed');
  assert.equal(combineReading(['observed', 'rule']), 'rule');
  assert.equal(combineReading(['rule', 'judged', 'observed']), 'judged');
  // 구성 요소가 없거나 모두 none이면 셀 대상이 없어 기본값(rule, 0을 규칙으로 읽음)
  assert.equal(combineReading([]), 'rule');
  assert.equal(combineReading(['none', 'none']), 'rule');
  // 모르는 값은 unknown으로 본다
  assert.equal(combineReading(['rule', 'maybe']), 'partial');
});

test('읽기 상태 건수: 노드에 적힌 상태만 값별·필드별(<종류>.<필드>)로 센다', async () => {
  const { setReading, countReadings } = await readingModule();
  const g = new Graph();
  setReading(g.add('task', 'a', 'a'), 'plan', 'rule');
  setReading(g.add('task', 'b', 'b'), 'plan', 'unknown');
  setReading(g.get('task', 'b'), 'openQuestions', 'partial');
  setReading(g.add('test', 't', 't'), 'count', 'partial');
  g.add('task', 'c', 'c');
  const r = countReadings(g.of('task').concat(g.of('test')));
  assert.deepEqual(r.values, { observed: 0, rule: 1, judged: 0, partial: 2, stale: 0, unknown: 1, none: 0 });
  assert.deepEqual(r.fields, { 'task.plan': { rule: 1, unknown: 1 }, 'task.openQuestions': { partial: 1 }, 'test.count': { partial: 1 } });
});

test('읽기 상태 생성물: 상태를 적지 않은 mini는 개요 수치가 모두 rule, 작업 reading은 빈 객체, 건수 0', async () => {
  const { data, overview } = await buildWith(null);
  assert.deepEqual(overview.counts.reading, { plans: 'rule', openQuestions: 'rule', tests: 'rule', grades: 'rule' });
  assert.deepEqual(data.readings.values, Object.fromEntries(VALUES.map((v) => [v, 0])));
  assert.deepEqual(data.readings.fields, {});
  assert.deepEqual(data.tasks.map((t) => [t.reading, t.readingNotes]), [[{}, {}]]);
  assert.deepEqual(data.tests.map((t) => t.reading), [{}]);
  assert.deepEqual(data.screens.map((s) => s.reading), [{}, {}]);
  assert.deepEqual(overview.tasks.map((t) => t.reading), [{}]);
});

test('SC-5 SC-10 읽기 상태 생성물: 노드 상태가 data·overview까지 닿고 개요에는 상태 값만 싣는다', async () => {
  const { graph, data, overview } = await buildWith([
    "  setReading(g.get('task', '20260101-sample'), 'openQuestions', 'partial', '첫 칸이 번호 하나가 아닌 행: tasks/20260101-sample/spec/final.md:9');",
    "  setReading(g.get('task', '20260101-sample'), 'plan', 'rule');",
    "  setReading(g.get('test', 'tests/api.test.mjs'), 'count', 'partial', '제목이 템플릿 문자열인 호출');",
    "  setReading(g.get('screen', '/live'), 'apis', 'rule');",
  ].join('\n'));
  const task = graph.nodes.find((n) => n.kind === 'task' && n.id === '20260101-sample');
  assert.deepEqual(task.props.reading, { openQuestions: 'partial', plan: 'rule' });
  assert.equal(graph.nodes.find((n) => n.kind === 'test').props.reading.count, 'partial');
  assert.deepEqual(data.tasks[0].reading, { openQuestions: 'partial', plan: 'rule' });
  assert.match(data.tasks[0].readingNotes.openQuestions, /final\.md:9/);
  assert.deepEqual(data.tests[0].reading, { count: 'partial' });
  assert.deepEqual(data.screens.find((s) => s.path === '/live').reading, { apis: 'rule' });
  assert.deepEqual(data.readings.values, { observed: 0, rule: 2, judged: 0, partial: 2, stale: 0, unknown: 0, none: 0 });
  assert.deepEqual(data.readings.fields, { 'task.openQuestions': { partial: 1 }, 'task.plan': { rule: 1 }, 'test.count': { partial: 1 }, 'screen.apis': { rule: 1 } });
  assert.deepEqual(overview.counts.reading, { plans: 'rule', openQuestions: 'partial', tests: 'partial', grades: 'rule' });
  assert.deepEqual(overview.tasks[0].reading, { openQuestions: 'partial', plan: 'rule' });
  // 개요에는 이유 문장(파일·줄)이 없다
  assert.equal(JSON.stringify(overview).includes('final.md:9'), false);
  assert.equal(JSON.stringify(overview).includes('readingNotes'), false);
});

test('읽기 상태 생성물: 등급 상태는 검사 lastRun과 화면 apis 상태의 합계다', async () => {
  const stale = await buildWith("  setReading(g.get('test', 'tests/api.test.mjs'), 'lastRun', 'stale', '검사 뒤 코드 변경');");
  assert.equal(stale.overview.counts.reading.grades, 'partial');
  assert.equal(stale.overview.counts.reading.tests, 'rule');
  const apis = await buildWith("  setReading(g.get('screen', '/mocked'), 'apis', 'partial');");
  assert.equal(apis.overview.counts.reading.grades, 'partial');
  const plan = await buildWith("  setReading(g.get('task', '20260101-sample'), 'plan', 'unknown');");
  assert.deepEqual(plan.overview.counts.reading, { plans: 'partial', openQuestions: 'rule', tests: 'rule', grades: 'rule' });
});
