// 결과 어댑터와 최신 판정(SC-2): 결과 JSON 우선, 없으면 JUnit, 둘 다 없으면 1.1.1 partial 문구.
// 결과는 실행 sha가 HEAD의 조상이고 그 뒤 커밋·실행 때 바뀐 경로가 설정의 문서 경로 밖을 건드리지 않을 때 최신이다.
// 픽스처 fixtures/results(mini 사본, 검사가 실제로 통과)를 임시 git 저장소로 복사해 실제 test-report와 build로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const BIN = join(PKG, 'bin', 'livemap.mjs');
const RESULTS_FIXTURE = join(HERE, 'fixtures', 'results');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (name) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `livemap-${name}-`))); made.push(d); return d; };
const childEnv = (extra = {}) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' }).trim();
const livemap = (cwd, args, extra) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: childEnv(extra) });
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function fixtureRepo() {
  const dir = tmp('results');
  cpSync(RESULTS_FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, '.gitignore'), 'map/.out/\nnode_modules/\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  return dir;
}
function build(dir) {
  const r = livemap(dir, ['build']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = (f) => readJson(join(dir, 'map', '.out', f));
  return { graph: out('graph.json'), data: out('data.json'), overview: out('overview.json') };
}
const testNode = (graph, id) => graph.nodes.find((n) => n.kind === 'test' && n.id === id);
const commit = (dir, file, text, msg) => { appendFileSync(join(dir, file), text); git(dir, 'commit', '-qam', msg); };

test('SC-2 결과 계약 픽스처: 통과 → 실패 → 문서 커밋 → 런타임 커밋에 신호·등급 A·lastRun이 따라간다', () => {
  const dir = fixtureRepo();
  let r = livemap(dir, ['test-report']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  let b = build(dir);
  assert.equal(b.overview.signals.tests, 'ok');
  assert.equal(b.overview.counts.grades.A, 1);
  let api = testNode(b.graph, 'tests/api.test.mjs');
  assert.deepEqual({ ...api.props.lastRun, at: null }, { passed: true, tests: 2, failed: 0, skipped: 0, pending: 0, runner: 'node', sha: git(dir, 'rev-parse', 'HEAD'), at: null, fresh: true, tags: [] });
  assert.equal(api.props.count, 2, '최신 결과가 있으면 개수는 실행 수');
  assert.equal(api.props.runCount, 2);
  assert.deepEqual(api.props.reading, { count: 'observed', lastRun: 'observed' });
  assert.equal(testNode(b.graph, 'tests/pw-pass.spec.mjs').props.reading.lastRun, 'unknown', '결과에 없는 파일');
  assert.deepEqual(b.data.testRuns.map((x) => Object.keys(x).sort()), [['at', 'exit', 'fresh', 'runner', 'sha', 'source']]);
  assert.equal(b.data.testRuns[0].fresh, true);

  // (a) 검사 하나를 실패로
  r = livemap(dir, ['test-report'], { LIVEMAP_FIXTURE_FAIL: '1' });
  assert.equal(r.status, 1);
  b = build(dir);
  assert.equal(b.overview.signals.tests, 'fail');
  assert.equal(b.overview.counts.grades.A, 0);
  api = testNode(b.graph, 'tests/api.test.mjs');
  assert.equal(api.props.lastRun.passed, false);
  assert.equal(api.props.lastRun.failed, 1);

  // (b) 통과 상태에서 tasks/ 파일만 바꾼 커밋
  assert.equal(livemap(dir, ['test-report']).status, 0);
  commit(dir, 'tasks/index.md', '- 메모\n', 'docs');
  b = build(dir);
  assert.equal(b.overview.signals.tests, 'ok');
  assert.equal(b.overview.counts.grades.A, 1);

  // (c) 런타임 경로 파일을 바꾼 커밋
  commit(dir, 'app/server.mjs', '// touch\n', 'runtime');
  b = build(dir);
  assert.equal(b.overview.signals.tests, 'stale');
  assert.equal(b.overview.counts.grades.A, 0);
  api = testNode(b.graph, 'tests/api.test.mjs');
  assert.equal(api.props.lastRun.fresh, false);
  assert.equal(api.props.reading.lastRun, 'stale');
  assert.match(api.props.readingNotes.lastRun, /문서 경로 밖 변경 커밋 1/);
  assert.equal(api.props.reading.count, undefined, '낡은 결과는 개수를 바꾸지 않는다');
  assert.equal(b.overview.counts.reading.grades, 'partial');
});

// 결과 JSON을 직접 써서 최신 판정 조건 하나씩 본다
const writeRun = (dir, run) => {
  mkdirSync(join(dir, 'map', '.out'), { recursive: true });
  writeFileSync(join(dir, 'map', '.out', 'test-results.json'), JSON.stringify({ schema: 1, runs: [{ runner: 'node', source: 'livemap test-report', dirtyPaths: [], at: '2026-01-01T00:00:00.000Z', exit: 0, outsideRoot: 0, files: [{ filePath: 'tests/api.test.mjs', tests: 2, passed: 2, failed: 0, skipped: 0, pending: 0, tags: [] }], ...run }] }));
};
const verdict = (dir) => { const b = build(dir); const t = testNode(b.graph, 'tests/api.test.mjs'); return { tests: b.overview.signals.tests, A: b.overview.counts.grades.A, reading: t.props.reading.lastRun, note: t.props.readingNotes?.lastRun || null }; };

test('SC-2 최신 판정: 같은 sha, 조상 sha 뒤 문서만 바꾼 커밋, 조상 sha 뒤 런타임 커밋, 조상이 아닌 sha, 이력에 없는 sha', () => {
  const dir = fixtureRepo();
  const base = git(dir, 'rev-parse', 'HEAD');
  writeRun(dir, { sha: base });
  assert.deepEqual(verdict(dir), { tests: 'ok', A: 1, reading: 'observed', note: null });

  // 결과 sha를 한 글자 바꾸면 이력에 없어 A가 사라지고 stale
  writeRun(dir, { sha: base.slice(0, -1) + (base.endsWith('0') ? '1' : '0') });
  assert.deepEqual(verdict(dir), { tests: 'stale', A: 0, reading: 'stale', note: '결과 커밋이 이력에 없음' });

  // 조상 sha 뒤 문서 경로만 바꾼 커밋 둘(작업 문서·위키·여정·로드맵·매니페스트)
  commit(dir, 'tasks/roadmap.md', '\n', 'docs 1');
  commit(dir, '.agent/wiki/index.md', '\n', 'docs 2');
  commit(dir, 'deploy/k8s/bff.yaml', '\n', 'bot manifest');
  commit(dir, 'map/semantic/journeys.json', '\n', 'journeys');
  writeRun(dir, { sha: base });
  assert.deepEqual(verdict(dir), { tests: 'ok', A: 1, reading: 'observed', note: null });

  // 조상이 아닌 sha: 다른 브랜치 커밋
  git(dir, 'checkout', '-qb', 'side');
  commit(dir, 'tasks/index.md', '- 곁가지\n', 'side');
  const side = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', 'main');
  writeRun(dir, { sha: side });
  assert.deepEqual(verdict(dir), { tests: 'stale', A: 0, reading: 'stale', note: '결과 커밋이 HEAD의 조상이 아님' });

  // 조상 sha 뒤 런타임 파일 커밋
  commit(dir, 'web/src/pages/Live.tsx', '\n', 'runtime');
  writeRun(dir, { sha: base });
  assert.deepEqual(verdict(dir), { tests: 'stale', A: 0, reading: 'stale', note: '결과 커밋 뒤 문서 경로 밖 변경 커밋 1' });
});

test('SC-2 최신 판정: 실행 때 바뀐 경로(dirtyPaths)가 문서 경로 밖이면 낡음, 문서 경로만이면 최신', () => {
  const dir = fixtureRepo();
  const head = git(dir, 'rev-parse', 'HEAD');
  writeRun(dir, { sha: head, dirtyPaths: ['tasks/20260101-sample/plan.md', 'map/captures/', '.agent/wiki/index.md'] });
  assert.deepEqual(verdict(dir), { tests: 'ok', A: 1, reading: 'observed', note: null });
  writeRun(dir, { sha: head, dirtyPaths: ['tasks/index.md', 'app/server.mjs'] });
  assert.deepEqual(verdict(dir), { tests: 'stale', A: 0, reading: 'stale', note: '실행 때 문서 경로 밖 변경 1(app/server.mjs)' });
  // 경로 앞부분만 같은 이름은 문서 경로가 아니다(tasks ⊄ tasks-old)
  writeRun(dir, { sha: head, dirtyPaths: ['tasks-old/x.md'] });
  assert.equal(verdict(dir).tests, 'stale');
});

test('SC-2 문서 경로는 설정 키에서만: 설정에 없는 문서 키의 경로 변경은 결과를 낡게 한다', () => {
  const dir = fixtureRepo();
  const cfgFile = join(dir, 'map', 'config.json');
  const cfg = readJson(cfgFile);
  cfg.roadmap = { file: 'ROADMAP.md' };
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  writeFileSync(join(dir, 'ROADMAP.md'), readFileSync(join(dir, 'tasks', 'roadmap.md'), 'utf8'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'root roadmap');
  const head = git(dir, 'rev-parse', 'HEAD');
  commit(dir, 'ROADMAP.md', '\n', 'roadmap doc');
  writeRun(dir, { sha: head });
  assert.equal(verdict(dir).tests, 'ok', 'roadmap.file 경로만 바꾼 커밋은 문서 커밋');
  // 같은 커밋 이력에서 설정의 roadmap 키만 없애면(작업트리 설정) 그 파일 변경은 문서 경로 밖이다
  delete cfg.roadmap;
  cfg.adapters = cfg.adapters.filter((a) => a !== 'roadmap');
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  assert.equal(verdict(dir).tests, 'stale');
});

test('SC-2 경로 정확 일치와 신호 네 값: booking 결과가 booking-journey 검사에 붙지 않고, 최신 실패·종료 코드는 fail, 낡은 실패는 stale', () => {
  const dir = fixtureRepo();
  writeFileSync(join(dir, 'tests', 'booking.test.mjs'), "import test from 'node:test';\ntest('b', () => {});\n");
  writeFileSync(join(dir, 'tests', 'booking-journey.test.mjs'), "import test from 'node:test';\ntest('bj', () => {});\n");
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'booking tests');
  const head = git(dir, 'rev-parse', 'HEAD');
  const file = (filePath, failed = 0) => ({ filePath, tests: 1, passed: 1 - failed, failed, skipped: 0, pending: 0, tags: [] });
  writeRun(dir, { sha: head, files: [file('tests/booking-journey.test.mjs')] });
  let b = build(dir);
  assert.equal(testNode(b.graph, 'tests/booking.test.mjs').props.lastRun, undefined);
  assert.equal(testNode(b.graph, 'tests/booking.test.mjs').props.reading.lastRun, 'unknown');
  assert.equal(testNode(b.graph, 'tests/booking-journey.test.mjs').props.lastRun.passed, true);

  // 실패 0이어도 최신 실행의 종료 코드가 0이 아니면 fail
  writeRun(dir, { sha: head, exit: 1, files: [file('tests/booking.test.mjs')] });
  assert.equal(build(dir).overview.signals.tests, 'fail');
  // 최신 실행의 실패
  writeRun(dir, { sha: head, files: [file('tests/booking.test.mjs', 1)] });
  assert.equal(build(dir).overview.signals.tests, 'fail');
  // 낡은 실행의 실패는 stale
  commit(dir, 'app/server.mjs', '// touch\n', 'runtime');
  b = build(dir);
  assert.equal(b.overview.signals.tests, 'stale');
  assert.equal(b.overview.signals.lastRun.fresh, false);
  // 실행이 없으면 none
  writeFileSync(join(dir, 'map', '.out', 'test-results.json'), JSON.stringify({ schema: 1, runs: [] }));
  b = build(dir);
  assert.equal(b.overview.signals.tests, 'none');
  assert.deepEqual(b.data.testRuns, []);
});

test('SC-2 JUnit만 있을 때: 같은 해석기로 읽고 메타 exit가 0이 아니면 fail, file 속성이 없으면 파일별 lastRun은 unknown', () => {
  const dir = fixtureRepo();
  const head = git(dir, 'rev-parse', 'HEAD');
  const out = join(dir, 'map', '.out');
  mkdirSync(out, { recursive: true });
  // node --test JUnit 모양: 최상위 testcase, file 속성 없음. 메타에는 dirtyPaths가 없어 셋째 조건을 건너뛴다
  writeFileSync(join(out, 'junit.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n\t<testcase name="resorts" classname="test"/>\n\t<testcase name="switch" classname="test"/>\n</testsuites>\n');
  writeFileSync(join(out, 'junit.json'), JSON.stringify({ sha: head, at: '2026-01-01T00:00:00.000Z', exit: 1 }));
  let b = build(dir);
  assert.equal(b.overview.signals.tests, 'fail');
  assert.equal(b.overview.signals.lastRun.total, 2);
  assert.equal(testNode(b.graph, 'tests/api.test.mjs').props.reading.lastRun, 'unknown');
  assert.equal(b.overview.counts.grades.A, 0);

  writeFileSync(join(out, 'junit.xml'), '<?xml version="1.0"?>\n<testsuites><testsuite name="api" file="tests/api.test.mjs"><testcase name="resorts"/><testcase name="switch"/></testsuite></testsuites>\n');
  writeFileSync(join(out, 'junit.json'), JSON.stringify({ sha: head, at: '2026-01-01T00:00:00.000Z', exit: 0 }));
  b = build(dir);
  assert.equal(b.overview.signals.tests, 'ok');
  assert.equal(b.overview.counts.grades.A, 1);
  assert.equal(testNode(b.graph, 'tests/api.test.mjs').props.lastRun.runner, 'junit');
});

test('SC-2 결과가 없으면 1.1.1 partial 문구 그대로이고 검사 lastRun은 unknown, 깨진 결과 JSON은 partial과 이유', () => {
  const dir = fixtureRepo();
  let b = build(dir);
  assert.equal(b.data.adapters.find((a) => a.name === 'testreport').error, '검사 리포트 없음(npm run test:report 미실행)');
  assert.equal(b.overview.signals.tests, 'none');
  assert.equal(testNode(b.graph, 'tests/api.test.mjs').props.reading.lastRun, 'unknown');
  mkdirSync(join(dir, 'map', '.out'), { recursive: true });
  writeFileSync(join(dir, 'map', '.out', 'test-results.json'), '{ 깨짐');
  b = build(dir);
  const a = b.data.adapters.find((x) => x.name === 'testreport');
  assert.equal(a.status, 'partial');
  assert.match(a.error, /결과 JSON/);
  assert.equal(b.overview.signals.tests, 'none');
});
