// 생산자 계약(SC-2): 실제 `node --test`를 임시 폴더에서 돌려 livemap 리포터와 JUnit 출력을 읽는다.
// 규칙에 맞춰 손으로 쓴 이벤트가 아니라 러너가 낸 이벤트로 검증해야 Node 판이 바뀌었을 때 여기서 실패한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.mjs';
// 결과 모듈은 검사마다 불러 red에서도 검사별 실패 까닭이 보이게 한다
const results = () => import('../src/results.mjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTER = join(HERE, '..', 'src', 'reporters', 'node-results.mjs');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (name) => { const d = mkdtempSync(join(tmpdir(), `livemap-${name}-`)); made.push(d); return d; };
// 이 검사 자신이 node --test 안에서 돌므로, 자식 러너가 "재귀 실행"으로 파일을 건너뛰지 않게 문맥 변수를 뺀다
const childEnv = () => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; return e; };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' }).trim();

// 최상위·describe·반복·건너뜀·todo·실패·불러오기 실패를 가진 검사 폴더를 커밋한 저장소
function project({ config = false } = {}) {
  const dir = tmp('reporter');
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests', 'shapes.test.mjs'), [
    "import test, { describe, it } from 'node:test';",
    "test('최상위', () => {});",
    "test('실패', () => { throw new Error('일부러'); });",
    "describe('묶음', () => { it('안쪽', () => {}); it.skip('건너뜀', () => {}); it.todo('할 일'); });",
    'for (const n of [1, 2]) test(`반복 ${n}`, () => {});',
    '',
  ].join('\n'));
  writeFileSync(join(dir, 'tests', 'broken.test.mjs'), "import './missing.mjs';\n");
  writeFileSync(join(dir, 'tests', 'plain.test.mjs'), "import test from 'node:test';\ntest('통과', () => {});\n");
  if (config) {
    mkdirSync(join(dir, 'map'));
    writeFileSync(join(dir, 'map', 'config.json'), JSON.stringify({ engine: 2, tests: { dir: 'tests', report: 'map/.out/junit.xml' } }));
    writeFileSync(join(dir, '.gitignore'), 'map/.out/\n');
  }
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  return dir;
}

const byPath = (run) => Object.fromEntries(run.files.map((f) => [f.filePath, f]));

test('SC-2 Node 리포터: 실제 node --test 이벤트를 파일별로 세고 describe는 빼며 불러오기 실패는 실패 1이다', () => {
  const dir = project();
  const outside = tmp('outside');
  writeFileSync(join(outside, 'extra.test.mjs'), "import test from 'node:test';\ntest('밖', () => {});\n");
  writeFileSync(join(dir, 'scratch.txt'), '작업트리 변경\n');
  const dest = join(tmp('dest'), 'node-results.json');
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', `--test-reporter=${REPORTER}`, `--test-reporter-destination=${dest}`,
    'tests/shapes.test.mjs', 'tests/broken.test.mjs', 'tests/plain.test.mjs', join(outside, 'extra.test.mjs')], { cwd: dir, env: childEnv(), encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  const doc = JSON.parse(readFileSync(dest, 'utf8'));
  assert.equal(doc.schema, 1);
  assert.equal(doc.runs.length, 1);
  const [run] = doc.runs;
  assert.equal(run.runner, 'node');
  assert.equal(run.sha, git(dir, 'rev-parse', 'HEAD'));
  assert.deepEqual(run.dirtyPaths, ['scratch.txt']);
  assert.equal(run.outsideRoot, 1);
  assert.equal(run.exit, null, '리포터는 러너 종료 코드를 모른다');
  assert.match(run.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(run.files.map((f) => f.filePath), ['tests/broken.test.mjs', 'tests/plain.test.mjs', 'tests/shapes.test.mjs']);
  const f = byPath(run);
  assert.deepEqual(f['tests/shapes.test.mjs'], { filePath: 'tests/shapes.test.mjs', tests: 7, passed: 4, failed: 1, skipped: 1, pending: 1, tags: [] });
  assert.deepEqual(f['tests/broken.test.mjs'], { filePath: 'tests/broken.test.mjs', tests: 1, passed: 0, failed: 1, skipped: 0, pending: 0, tags: [] });
  assert.deepEqual(f['tests/plain.test.mjs'], { filePath: 'tests/plain.test.mjs', tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, tags: [] });
});

test('SC-2 livemap test-report: JUnit·메타와 결과 JSON을 함께 남기고 종료 코드는 러너 종료 코드다', async () => {
  const dir = project({ config: true });
  const head = git(dir, 'rev-parse', 'HEAD');
  const code = await main(['test-report', '--root', dir]);
  assert.equal(code, 1);
  const xml = readFileSync(join(dir, 'map/.out/junit.xml'), 'utf8');
  assert.match(xml, /<testcase /);
  const meta = JSON.parse(readFileSync(join(dir, 'map/.out/junit.json'), 'utf8'));
  assert.equal(meta.sha, head);
  assert.equal(meta.exit, 1);
  const { readResults, writeResults, resultsPath } = await results();
  const file = join(dir, resultsPath({ tests: { report: 'map/.out/junit.xml' } }));
  assert.equal(file, join(dir, 'map/.out/test-results.json'));
  const doc = readResults(file);
  assert.equal(doc.runs.length, 1);
  const [run] = doc.runs;
  assert.equal(run.runner, 'node');
  assert.equal(run.source, 'livemap test-report');
  assert.equal(run.sha, head);
  assert.deepEqual(run.dirtyPaths, []);
  assert.equal(run.exit, 1);
  assert.equal(byPath(run)['tests/shapes.test.mjs'].failed, 1);
  assert.equal(byPath(run)['tests/broken.test.mjs'].failed, 1);

  // 다른 출처의 실행은 남고 같은 러너·출처의 실행만 바뀐다. 임시 파일은 남지 않는다
  writeResults(file, { runner: 'playwright', source: 'map/.out/playwright.json', sha: head, dirtyPaths: [], at: '2026-01-01T00:00:00.000Z', exit: null, files: [] });
  rmSync(join(dir, 'tests', 'broken.test.mjs'));
  writeFileSync(join(dir, 'tests', 'shapes.test.mjs'), "import test from 'node:test';\ntest('최상위', () => {});\n");
  assert.equal(await main(['test-report', '--root', dir]), 0);
  const after = readResults(file);
  assert.deepEqual(after.runs.map((x) => `${x.runner}:${x.source}`).sort(), ['node:livemap test-report', 'playwright:map/.out/playwright.json']);
  const node = after.runs.find((x) => x.runner === 'node');
  assert.equal(node.exit, 0);
  assert.deepEqual(node.dirtyPaths, ['tests/broken.test.mjs', 'tests/shapes.test.mjs']);
  assert.deepEqual(readdirSync(join(dir, 'map/.out')).sort(), ['junit.json', 'junit.xml', 'test-results.json']);
});

test('SC-2 결과 JSON 쓰기: 없으면 만들고, 같은 러너·출처만 바꾸며, 깨진 파일은 읽기 오류다', async () => {
  const { readResults, writeResults } = await results();
  const dir = tmp('results');
  const file = join(dir, 'out', 'test-results.json');
  assert.deepEqual(readResults(file), { schema: 1, runs: [] });
  const run = (runner, source, exit) => ({ runner, source, sha: 'a'.repeat(40), dirtyPaths: [], at: '2026-01-01T00:00:00.000Z', exit, files: [] });
  writeResults(file, run('node', 'livemap test-report', 1));
  writeResults(file, run('node', 'map/.out/node-results.json', 0));
  writeResults(file, run('node', 'livemap test-report', 0));
  const doc = readResults(file);
  assert.equal(doc.schema, 1);
  assert.deepEqual(doc.runs.map((x) => [x.source, x.exit]), [['livemap test-report', 0], ['map/.out/node-results.json', 0]]);
  assert.deepEqual(readdirSync(join(dir, 'out')), ['test-results.json']);
  writeFileSync(file, '{ 깨짐');
  assert.throws(() => readResults(file), /결과 JSON/);
  assert.equal(existsSync(file), true);
});
