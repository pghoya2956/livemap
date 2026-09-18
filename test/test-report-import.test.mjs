// 결과 import 계약(SC-3): `livemap test-report --import <파일> [--sha <커밋>]`.
// Playwright는 이 저장소 devDependency(1.63.0)로 브라우저 없는 spec을 실제로 돌린 JSON을, JUnit은 실제 node --test JUnit 출력을 쓴다.
// 중첩 suite·flaky·skipped·file 속성처럼 작은 실행으로 만들기 어려운 모양만 실측 필드 이름 그대로 손으로 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const BIN = join(PKG, 'bin', 'livemap.mjs');
const PLAYWRIGHT = join(PKG, 'node_modules', '.bin', 'playwright');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
// macOS 임시 폴더는 /var → /private/var 심볼릭 링크라 러너가 적는 실제 경로와 맞추려고 실제 경로를 쓴다
const tmp = (name) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `livemap-${name}-`))); made.push(d); return d; };
const childEnv = (extra = {}) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' }).trim();
const livemap = (cwd, ...args) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: childEnv() }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const RESULTS = 'map/.out/test-results.json';

// map/config.json과 .gitignore를 커밋한 빈 프로젝트
function project(files = {}) {
  const dir = tmp('import');
  mkdirSync(join(dir, 'map'));
  writeFileSync(join(dir, 'map', 'config.json'), JSON.stringify({ engine: 2, tests: { dir: 'tests', report: 'map/.out/junit.xml' } }));
  writeFileSync(join(dir, '.gitignore'), 'map/.out/\nnode_modules\n');
  for (const [name, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, name)), { recursive: true }); writeFileSync(join(dir, name), text); }
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  return dir;
}

test('SC-3 Playwright 1.63.0 JSON 리포터 실제 출력을 import하면 파일별 통과·실패·태그가 결과 JSON에 들어간다', () => {
  const dir = project({
    'playwright.config.mjs': "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: 'tests', testMatch: '*.spec.mjs', outputDir: 'map/.out/playwright-artifacts', workers: 1 });\n",
    'tests/pw-pass.spec.mjs': "import { test, expect } from '@playwright/test';\ntest('합계가 맞다', { tag: '@sample/pass' }, async () => { expect(1 + 1).toBe(2); });\n",
    'tests/pw-fail.spec.mjs': "import { test, expect } from '@playwright/test';\ntest('일부러 틀린다', { tag: '@sample/fail' }, async () => { expect(1 + 1).toBe(3); });\n",
  });
  symlinkSync(join(PKG, 'node_modules'), join(dir, 'node_modules'));
  mkdirSync(join(dir, 'map', '.out'));
  const out = join(dir, 'map', '.out', 'playwright.json');
  const pw = spawnSync(PLAYWRIGHT, ['test', '--reporter=json'], { cwd: dir, encoding: 'utf8', env: childEnv({ PLAYWRIGHT_JSON_OUTPUT_NAME: out }) });
  assert.equal(pw.status, 1, pw.stderr);
  // 생산자 필드 대조(P0 실측 원본과 같은 자리): config.rootDir, suites[].file, specs[].tags, tests[].status, stats.startTime
  const raw = readJson(out);
  assert.equal(raw.config.rootDir, join(dir, 'tests'));
  assert.deepEqual(raw.suites.map((s) => s.file).sort(), ['pw-fail.spec.mjs', 'pw-pass.spec.mjs']);
  assert.deepEqual(raw.suites.flatMap((s) => s.specs.flatMap((x) => x.tags)).sort(), ['sample/fail', 'sample/pass']);
  assert.deepEqual(raw.suites.flatMap((s) => s.specs.flatMap((x) => x.tests.map((t) => t.status))).sort(), ['expected', 'unexpected']);
  assert.match(raw.stats.startTime, /^\d{4}-\d{2}-\d{2}T/);

  writeFileSync(join(dir, 'scratch.txt'), '작업트리 변경\n');
  const r = livemap(dir, 'test-report', '--import', 'map/.out/playwright.json');
  assert.equal(r.code, 0, r.out + r.err);
  const doc = readJson(join(dir, RESULTS));
  assert.equal(doc.runs.length, 1);
  const [run] = doc.runs;
  assert.deepEqual({ runner: run.runner, source: run.source, stamped: run.stamped, sha: run.sha, dirtyPaths: run.dirtyPaths, at: run.at, exit: run.exit, outsideRoot: run.outsideRoot },
    { runner: 'playwright', source: 'map/.out/playwright.json', stamped: 'import', sha: git(dir, 'rev-parse', 'HEAD'), dirtyPaths: ['scratch.txt'], at: raw.stats.startTime, exit: null, outsideRoot: 0 });
  assert.deepEqual(run.files, [
    { filePath: 'tests/pw-fail.spec.mjs', tests: 1, passed: 0, failed: 1, skipped: 0, pending: 0, flaky: 0, tags: ['sample/fail'] },
    { filePath: 'tests/pw-pass.spec.mjs', tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, flaky: 0, tags: ['sample/pass'] },
  ]);
  // 같은 러너·출처를 다시 넣으면 바뀌고, --sha는 기준 커밋을 덮는다
  const again = livemap(dir, 'test-report', '--import', join(dir, 'map/.out/playwright.json'), '--sha', 'b'.repeat(40));
  assert.equal(again.code, 0, again.out + again.err);
  const after = readJson(join(dir, RESULTS));
  assert.equal(after.runs.length, 1);
  assert.equal(after.runs[0].sha, 'b'.repeat(40));
});

test('SC-3 import 판별: Playwright 중첩 suite·flaky·skipped와 루트 밖 rootDir', () => {
  const dir = project();
  const spec = (title, status, tags = []) => ({ title, ok: status !== 'unexpected', tags, tests: [{ expectedStatus: status === 'skipped' ? 'skipped' : 'passed', projectName: '', results: [], status }], file: 'nested.spec.mjs' });
  const report = {
    config: { rootDir: join(dir, 'e2e') },
    suites: [
      { title: 'nested.spec.mjs', file: 'nested.spec.mjs', specs: [spec('바깥', 'expected', ['a'])], suites: [
        { title: '묶음', file: 'nested.spec.mjs', specs: [spec('재시도 통과', 'flaky', ['b', 'a']), spec('건너뜀', 'skipped'), spec('실패', 'unexpected')], suites: [] },
      ] },
      { title: 'far.spec.mjs', file: '../../far.spec.mjs', specs: [{ ...spec('밖', 'expected'), file: '../../far.spec.mjs' }] },
    ],
    stats: { startTime: '2026-01-02T03:04:05.000Z', expected: 2, skipped: 1, unexpected: 1, flaky: 1 },
    errors: [],
  };
  writeFileSync(join(dir, 'pw.json'), JSON.stringify(report));
  const r = livemap(dir, 'test-report', '--import', 'pw.json', '--sha', 'c'.repeat(40));
  assert.equal(r.code, 0, r.out + r.err);
  const [run] = readJson(join(dir, RESULTS)).runs;
  assert.equal(run.sha, 'c'.repeat(40));
  assert.equal(run.outsideRoot, 1);
  assert.deepEqual(run.files, [{ filePath: 'e2e/nested.spec.mjs', tests: 4, passed: 2, failed: 1, skipped: 1, pending: 0, flaky: 1, tags: ['a', 'b'] }]);
});

test('SC-3 import 판별: 실제 node --test JUnit(최상위 testcase, file 속성 없음)은 실행 전체만, file 속성이 있으면 파일별', () => {
  const dir = project({
    'tests/a.test.mjs': "import test, { describe, it } from 'node:test';\ntest('최상위', () => {});\ntest('실패', () => { throw new Error('x'); });\ndescribe('묶음', () => { it('안쪽', () => {}); it.skip('건너뜀', () => {}); it.todo('할 일'); });\n",
  });
  const junit = spawnSync(process.execPath, ['--test', '--test-reporter=junit', '--test-reporter-destination=node-junit.xml', 'tests/a.test.mjs'], { cwd: dir, env: childEnv(), encoding: 'utf8' });
  assert.equal(junit.status, 1, junit.stderr);
  const xml = readFileSync(join(dir, 'node-junit.xml'), 'utf8');
  assert.match(xml, /^<\?xml[\s\S]*<testsuites>\s*<testcase /, '최상위 testcase가 testsuite 밖에 있다(22.22.2 실측 모양)');
  let r = livemap(dir, 'test-report', '--import', 'node-junit.xml');
  assert.equal(r.code, 0, r.out + r.err);
  let [run] = readJson(join(dir, RESULTS)).runs;
  assert.deepEqual({ runner: run.runner, source: run.source, stamped: run.stamped, files: run.files, totals: run.totals },
    { runner: 'junit', source: 'node-junit.xml', stamped: 'import', files: [], totals: { tests: 5, passed: 2, failed: 1, skipped: 1, pending: 1 } });

  writeFileSync(join(dir, 'with-file.xml'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    '  <testsuite name="tests/b.test.mjs" file="tests/b.test.mjs" tests="2">',
    '    <testcase name="하나" classname="b"/>',
    '    <testsuite name="안쪽"><testcase name="둘" classname="b"><failure message="a &gt; b">x</failure></testcase></testsuite>',
    '  </testsuite>',
    `  <testcase name="셋" file="${join(dir, 'tests', 'c.test.mjs')}"><skipped/></testcase>`,
    '  <testcase name="넷"/>',
    '</testsuites>',
  ].join('\n'));
  r = livemap(dir, 'test-report', '--import', 'with-file.xml');
  assert.equal(r.code, 0, r.out + r.err);
  run = readJson(join(dir, RESULTS)).runs.find((x) => x.source === 'with-file.xml');
  assert.deepEqual(run.files, [
    { filePath: 'tests/b.test.mjs', tests: 2, passed: 1, failed: 1, skipped: 0, pending: 0, tags: [] },
    { filePath: 'tests/c.test.mjs', tests: 1, passed: 0, failed: 0, skipped: 1, pending: 0, tags: [] },
  ]);
  assert.deepEqual(run.totals, { tests: 4, passed: 2, failed: 1, skipped: 1, pending: 0 });
});

test('SC-3 import 판별: livemap 리포터 출력은 그 sha를 지키고, 모르는 형식·없는 파일은 exit 2이며 결과 JSON을 건드리지 않는다', () => {
  const dir = project();
  const reporterOut = { schema: 1, runs: [{ runner: 'node', source: null, sha: 'd'.repeat(40), dirtyPaths: ['x.txt'], at: '2026-01-01T00:00:00.000Z', exit: null, outsideRoot: 0, files: [{ filePath: 'tests/a.test.mjs', tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, tags: [] }] }] };
  writeFileSync(join(dir, 'node-results.json'), JSON.stringify(reporterOut));
  let r = livemap(dir, 'test-report', '--import', 'node-results.json');
  assert.equal(r.code, 0, r.out + r.err);
  const before = readFileSync(join(dir, RESULTS), 'utf8');
  const [run] = JSON.parse(before).runs;
  assert.deepEqual(run, { ...reporterOut.runs[0], source: 'node-results.json' });

  writeFileSync(join(dir, 'other.json'), JSON.stringify({ hello: 'world' }));
  writeFileSync(join(dir, 'other.txt'), 'plain text\n');
  for (const f of ['other.json', 'other.txt', 'missing.json']) {
    r = livemap(dir, 'test-report', '--import', f);
    assert.equal(r.code, 2, `${f}: ${r.out}${r.err}`);
  }
  assert.equal(readFileSync(join(dir, RESULTS), 'utf8'), before);
  r = livemap(dir, 'test-report', '--import');
  assert.equal(r.code, 2);
  assert.equal(existsSync(join(dir, 'map', '.out', 'junit.xml')), false, '--import는 러너를 돌리지 않는다');
});
