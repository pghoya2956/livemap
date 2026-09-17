// g.issue 검사: 프로젝트 어댑터가 낸 오류·경고가 그래프·생성물·check 출력·종료 코드까지 이어지는지 본다(SC-12).
// 명령 검사는 픽스처(fixtures/mini)를 임시 폴더에 복사하고 프로젝트 어댑터 하나를 더해 bin/livemap.mjs를 자식 프로세스로 부른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph, runAdapter, NODE_KINDS } from '../src/lib/graph.mjs';
import { buildGraph } from '../src/cli.mjs';
import { check } from '../src/check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(resolve(HERE, '..'), 'bin', 'livemap.mjs');
const MINI = join(HERE, 'fixtures', 'mini');

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// 경고 하나와 오류 하나를 내는 프로젝트 어댑터를 config.adapters 끝에 더한 픽스처 사본
function projectWithProbe() {
  const dir = mkdtempSync(join(tmpdir(), 'livemap issue 검사-'));
  made.push(dir);
  cpSync(MINI, dir, { recursive: true });
  mkdirSync(join(dir, 'map/adapters'), { recursive: true });
  writeFileSync(join(dir, 'map/adapters/probe.mjs'), [
    'export default function probe(g) {',
    "  g.issue('warn', '표본 경고', '결정 대기가 오래됨');",
    "  g.issue('error', '표본 오류', '필수 항목 없음');",
    '  return null;',
    '}',
    '',
  ].join('\n'));
  const cfgFile = join(dir, 'map/config.json');
  const cfg = readJson(cfgFile);
  cfg.adapters = [...cfg.adapters, 'probe'];
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  return dir;
}
const run = (cwd, args) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };

test('SC-12 g.issue: warn·error를 실행 중 어댑터 이름과 함께 기록하고 toJSON에 issues로 낸다', () => {
  const g = new Graph();
  runAdapter(g, 'probe', (g) => { g.issue('warn', '라벨 가', '메시지 가'); g.issue('error', '라벨 나', '메시지 나'); return null; });
  assert.deepEqual(g.toJSON().issues, [
    { level: 'warn', label: '라벨 가', message: '메시지 가', adapter: 'probe' },
    { level: 'error', label: '라벨 나', message: '메시지 나', adapter: 'probe' },
  ]);
  assert.deepEqual(g.adapters, [{ name: 'probe', status: 'ok', count: 0, error: null }]);
  // 어댑터 실행 밖에서 부르면 어댑터 이름은 null
  g.issue('warn', '밖', '실행 밖');
  assert.equal(g.issues.at(-1).adapter, null);
});

test('SC-12 g.issue: level이 error·warn이 아니거나 label·message가 문자열이 아니면 그 어댑터만 failed', () => {
  const g = new Graph();
  runAdapter(g, 'badLevel', (g) => { g.issue('info', '라벨', '메시지'); return null; });
  runAdapter(g, 'badLabel', (g) => { g.issue('warn', 3, '메시지'); return null; });
  runAdapter(g, 'badMessage', (g) => { g.issue('error', '라벨', undefined); return null; });
  runAdapter(g, 'next', (g) => { g.issue('warn', '다음', '정상'); return null; });
  assert.deepEqual(g.adapters.map((a) => [a.name, a.status]), [['badLevel', 'failed'], ['badLabel', 'failed'], ['badMessage', 'failed'], ['next', 'ok']]);
  assert.deepEqual(g.issues, [{ level: 'warn', label: '다음', message: '정상', adapter: 'next' }]);
});

test('SC-12 graph: release 노드 종류를 받는다', () => {
  assert.ok(NODE_KINDS.includes('release'));
  const g = new Graph();
  g.add('release', 'm1', '첫 마일스톤');
  assert.equal(g.of('release').length, 1);
});

test('SC-12 derive·check: data.json issues와 check 줄, error만 오류 수에 든다', async () => {
  const base = await buildGraph(MINI);
  // mini에서 나오는 이슈는 1.2.0 작업 문서 읽기 계약 경고뿐이다
  assert.deepEqual(base.data.issues.map((i) => [i.adapter, i.level, i.code]), [['tasks', 'warn', 'tasks.questions-unknown']]);
  const dir = projectWithProbe();
  const { data, cfg } = await buildGraph(dir);
  assert.deepEqual(data.issues.filter((i) => i.adapter === 'probe'), [
    { level: 'warn', label: '표본 경고', message: '결정 대기가 오래됨', adapter: 'probe' },
    { level: 'error', label: '표본 오류', message: '필수 항목 없음', adapter: 'probe' },
  ]);
  const before = check(base.data, base.cfg);
  const after = check(data, cfg);
  assert.deepEqual(after.slice(-2), [{ level: 'warn', msg: '표본 경고: 결정 대기가 오래됨' }, { level: 'error', msg: '표본 오류: 필수 항목 없음' }]);
  const errors = (ps) => ps.filter((p) => p.level === 'error').length;
  assert.equal(errors(after), errors(before) + 1);
});

test('SC-12 livemap check·build: △·✗ 줄, exit 1, 생성물 issues 2건', () => {
  const dir = projectWithProbe();
  const c = run(dir, ['check']);
  assert.equal(c.code, 1, c.out + c.err);
  assert.match(c.out, /^△ 표본 경고: 결정 대기가 오래됨$/m);
  assert.match(c.out, /^✗ 표본 오류: 필수 항목 없음$/m);
  const b = run(dir, ['build']);
  assert.equal(b.code, 0, b.out + b.err);
  for (const f of ['data.json', 'graph.json']) {
    const issues = readJson(join(dir, 'map/.out', f)).issues.filter((i) => !String(i.code).startsWith('tasks.'));
    assert.equal(issues.length, 2, f);
    assert.ok(issues.every((i) => i.adapter === 'probe'), f);
  }
});
