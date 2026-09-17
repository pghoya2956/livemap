// 이슈 계약 검사: g.issue 넷째 인자(code·subject·anchors·resolutions), 코드 표, check --json, 묶음 줄, --strict.
// 명령 검사는 임시 폴더에 프로젝트 어댑터만 도는 작은 프로젝트나 픽스처(fixtures/mini) 사본을 만들고 bin/livemap.mjs를 자식 프로세스로 부른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph, runAdapter } from '../src/lib/graph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const BIN = join(PKG, 'bin', 'livemap.mjs');
const MINI = join(HERE, 'fixtures', 'mini');
const VERSION = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (label) => { const d = mkdtempSync(join(tmpdir(), `livemap ${label} 검사-`)); made.push(d); return d; };
const run = (cwd, args) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const issuesModule = () => import('../src/lib/issues.mjs');

// 프로젝트 어댑터 하나(body는 함수 본문)만 도는 프로젝트. 여정·바닥값이 없어 check 기존 줄은 0이다
function probeProject(body, name = 'probe') {
  const dir = tmp('이슈 계약');
  mkdirSync(join(dir, 'map/adapters'), { recursive: true });
  writeFileSync(join(dir, 'map/config.json'), JSON.stringify({ engine: 1, adapters: [name], semantic: 'map/semantic/없음.json' }, null, 2) + '\n');
  writeFileSync(join(dir, 'map/adapters', `${name}.mjs`), `export default function ${name}(g) {\n${body}\n  return null;\n}\n`);
  return dir;
}
const issueCall = (level, code, id, extra = '') => `  g.issue('${level}', '표본', '${code} ${id}', { code: '${code}', subject: { kind: 'step', id: '${id}' }${extra} });`;

// 1.1.1 mini 픽스처의 check 텍스트 출력(문구·순서 고정)
const MINI_CHECK_1_1_1 = [
  '△ 여정 하나 › 동작 장면: intent 비어 있음',
  '△ 여정 하나 › 목업 장면: intent 비어 있음',
  '△ 여정 하나 › 없는 라우트: intent 비어 있음',
  '✗ 여정 하나 › 없는 라우트: 라우트 없음: /nope',
  '△ 여정 하나 › 없는 라우트: planned 인데 화면이 있음(mock 이 맞는지 확인)',
  '✗ 로드맵 둘째 항목: 장면 없음: j1/zz',
  '✗ 로드맵 둘째 항목: 작업 폴더 없음: 20269999-none',
  '✗ 로드맵 둘째 항목: 선행 항목 없음: ghost',
  '✗ 로드맵 둘째 항목: 알 수 없는 상태: 모름',
  '△ 어느 화면도 부르지 않는 API 2: /api/login, /api/items/:id',
  '△ 배포 sha가 main 이력에 없어 뒤처짐을 계산하지 못함',
  'map check: 오류 5',
];

test('SC-7 g.issue 넷째 인자: code·subject·anchors·resolutions를 기록하고 세 인자 호출은 1.1.0 모양 그대로', () => {
  const g = new Graph();
  runAdapter(g, 'probe', (g) => {
    g.issue('warn', '세 인자', '그대로');
    g.issue('warn', '작업 문서', '완료 작업에 닫히지 않은 잔여 질문 1', {
      code: 'tasks.questions-open-done',
      subject: { kind: 'task', id: '20260101-sample' },
      anchors: [{ file: 'tasks/20260101-sample/spec/final.md', line: 12, excerpt: '| OQ-02 | 남은 질문 |' }],
      resolutions: ['judge'],
    });
    return null;
  });
  assert.deepEqual(g.adapters.map((a) => a.status), ['ok']);
  assert.deepEqual(g.toJSON().issues, [
    { level: 'warn', label: '세 인자', message: '그대로', adapter: 'probe' },
    {
      level: 'warn', label: '작업 문서', message: '완료 작업에 닫히지 않은 잔여 질문 1', adapter: 'probe',
      code: 'tasks.questions-open-done', subject: { kind: 'task', id: '20260101-sample' },
      anchors: [{ file: 'tasks/20260101-sample/spec/final.md', line: 12, excerpt: '| OQ-02 | 남은 질문 |' }], resolutions: ['judge'],
    },
  ]);
});

test('SC-7 g.issue 넷째 인자: 생략한 subject·anchors·resolutions는 null·[]·코드 표 기본값, 줄 없는 근거는 line null', () => {
  const g = new Graph();
  runAdapter(g, 'probe', (g) => {
    g.issue('warn', '작업 문서', '절 없음', { code: 'tasks.questions-unknown', anchors: [{ file: 'tasks/a/spec/final.md' }] });
    g.issue('warn', '프로젝트', '자체 코드', { code: 'project.custom-rule' });
    return null;
  });
  const [a, b] = g.issues;
  assert.deepEqual([a.subject, a.anchors, a.resolutions], [null, [{ file: 'tasks/a/spec/final.md', line: null }], ['source', 'judge']]);
  assert.deepEqual([b.code, b.subject, b.anchors, b.resolutions], ['project.custom-rule', null, [], []]);
});

test('SC-7 g.issue 넷째 인자: 형식이 틀리면 throw해 그 어댑터만 failed', () => {
  const bad = {
    notObject: 'code',
    noCode: {},
    badCode: { code: 'Tasks Unread' },
    wrongLevelForKnownCode: { code: 'judgment.invalid' },
    badSubject: { code: 'tasks.unread-definition', subject: { kind: 'task' } },
    anchorsNotArray: { code: 'tasks.unread-definition', anchors: { file: 'a.md', line: 1 } },
    anchorNoFile: { code: 'tasks.unread-definition', anchors: [{ line: 1 }] },
    anchorBadLine: { code: 'tasks.unread-definition', anchors: [{ file: 'a.md', line: 0 }] },
    anchorBadExcerpt: { code: 'tasks.unread-definition', anchors: [{ file: 'a.md', line: 1, excerpt: 3 }] },
    badResolution: { code: 'tasks.unread-definition', resolutions: ['fix'] },
    unknownKey: { code: 'tasks.unread-definition', severity: 'high' },
  };
  const g = new Graph();
  for (const [name, detail] of Object.entries(bad)) runAdapter(g, name, (g) => { g.issue('warn', '라벨', '메시지', detail); return null; });
  runAdapter(g, 'next', (g) => { g.issue('warn', '다음', '정상', { code: 'tasks.unread-definition' }); return null; });
  assert.deepEqual(g.adapters.filter((a) => a.status !== 'failed').map((a) => a.name), ['next']);
  assert.equal(g.adapters.length, Object.keys(bad).length + 1);
  assert.deepEqual(g.issues.map((i) => i.message), ['정상']);
});

test('SC-7 g.issue 근거 줄 excerpt는 120 코드 포인트까지 자른다', () => {
  const g = new Graph();
  const long = '가😀'.repeat(70); // 140 코드 포인트, UTF-16으로는 210
  runAdapter(g, 'probe', (g) => { g.issue('warn', '라벨', '긴 근거', { code: 'tasks.unread-definition', anchors: [{ file: 'a.md', line: 3, excerpt: long }, { file: 'a.md', line: 4, excerpt: '짧음' }] }); return null; });
  const [a, b] = g.issues[0].anchors;
  assert.equal([...a.excerpt].length, 120);
  assert.equal(a.excerpt, [...long].slice(0, 120).join(''));
  assert.equal(b.excerpt, '짧음');
});

test('SC-7 코드 표: 새 코드 13개의 수준·처리가 스펙과 같고 docs/issue-codes.md 표와 코드 집합이 같다', async () => {
  const { ISSUE_CODES, NEW_CODES } = await issuesModule();
  const expected = {
    'tasks.unread-definition': ['warn', ['source', 'judge']],
    'tasks.unread-checklist': ['warn', ['source', 'judge']],
    'tasks.stage-unknown': ['warn', ['source']],
    'tasks.questions-unknown': ['warn', ['source', 'judge']],
    'tasks.questions-open-done': ['warn', ['judge']],
    'tasks.index-section-unknown': ['warn', ['source']],
    'tasks.ambiguous-ref': ['warn', ['source']],
    'judgment.invalid': ['error', ['judge']],
    'judgment.stale': ['warn', ['judge']],
    'router.unknown-api': ['warn', ['code', 'config']],
    'router.hookapi-redundant': ['warn', ['config']],
    'router.hookapi-only': ['warn', ['code', 'config']],
    'journey.api-not-observed': ['warn', ['source', 'code']],
  };
  assert.deepEqual([...NEW_CODES].sort(), Object.keys(expected).sort());
  for (const [code, [level, resolutions]] of Object.entries(expected)) assert.deepEqual([ISSUE_CODES[code].level, ISSUE_CODES[code].resolutions], [level, resolutions], code);
  const doc = readFileSync(join(PKG, 'docs', 'issue-codes.md'), 'utf8');
  const docCodes = [...doc.matchAll(/^\| `([a-z0-9.-]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual([...new Set(docCodes)].sort(), Object.keys(ISSUE_CODES).sort());
  assert.equal(docCodes.length, new Set(docCodes).size, '문서 표에 같은 코드가 두 번');
});

test('SC-7 check 텍스트: mini 픽스처의 1.1.1 줄·순서·종료 코드가 그대로다', () => {
  const r = run(MINI, ['check']);
  assert.equal(r.code, 1, r.err);
  assert.deepEqual(r.out.trimEnd().split('\n'), MINI_CHECK_1_1_1);
});

test('SC-7 check --json: stdout은 JSON 하나, schema·engine·errors·warnings와 기존 줄마다 코드, 종료 코드는 텍스트와 같다', () => {
  const r = run(MINI, ['check', '--json']);
  assert.equal(r.code, 1, r.err);
  const j = JSON.parse(r.out);
  assert.deepEqual(Object.keys(j), ['schema', 'engine', 'errors', 'warnings', 'problems']);
  assert.equal(j.schema, 1);
  assert.equal(j.engine, VERSION);
  assert.equal(j.errors, 5);
  assert.equal(j.warnings, 6);
  assert.equal(j.problems.length, MINI_CHECK_1_1_1.length - 1);
  for (const p of j.problems) {
    assert.deepEqual(Object.keys(p), ['level', 'code', 'msg', 'subject', 'anchors', 'resolutions'], p.msg);
    assert.match(p.code, /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/, p.msg);
    assert.ok(Array.isArray(p.anchors) && Array.isArray(p.resolutions), p.msg);
  }
  // 텍스트 줄과 JSON msg가 같은 집합
  const text = MINI_CHECK_1_1_1.slice(0, -1).map((l) => l.slice(2)).sort();
  assert.deepEqual(j.problems.map((p) => p.msg).sort(), text);
  const byMsg = Object.fromEntries(j.problems.map((p) => [p.msg, p]));
  assert.equal(byMsg['여정 하나 › 없는 라우트: 라우트 없음: /nope'].code, 'step.route-missing');
  assert.deepEqual(byMsg['여정 하나 › 없는 라우트: 라우트 없음: /nope'].subject, { kind: 'step', id: 'j1/s3' });
  assert.equal(byMsg['로드맵 둘째 항목: 작업 폴더 없음: 20269999-none'].code, 'roadmap.task-missing');
  assert.equal(byMsg['어느 화면도 부르지 않는 API 2: /api/login, /api/items/:id'].code, 'orphan.apis');
  assert.equal(byMsg['배포 sha가 main 이력에 없어 뒤처짐을 계산하지 못함'].code, 'deploy.behind-unknown');
  assert.equal(r.err, '');
});

test('SC-7 check --json 정렬: 수준(error 먼저) → 코드 → 파일 → 줄', () => {
  const dir = probeProject([
    "  const a = (file, line) => [{ file, line }];",
    "  g.issue('warn', '표본', 'b-2', { code: 'tasks.unread-definition', anchors: a('b.md', 2) });",
    "  g.issue('warn', '표본', 'a-9', { code: 'tasks.unread-definition', anchors: a('a.md', 9) });",
    "  g.issue('warn', '표본', 'a-10', { code: 'tasks.unread-definition', anchors: a('a.md', 10) });",
    "  g.issue('warn', '표본', 'ambig', { code: 'tasks.ambiguous-ref', anchors: a('z.md', 1) });",
    "  g.issue('error', '표본', 'invalid', { code: 'judgment.invalid', anchors: a('z.md', 1) });",
    "  g.issue('warn', '표본', '세 인자');",
  ].join('\n'));
  const r = run(dir, ['check', '--json']);
  assert.equal(r.code, 1, r.out + r.err);
  const j = JSON.parse(r.out);
  assert.deepEqual(j.problems.map((p) => p.msg.replace('표본: ', '')), ['invalid', '세 인자', 'ambig', 'a-9', 'a-10', 'b-2']);
  assert.deepEqual([j.errors, j.warnings], [1, 5]);
  assert.equal(j.problems[1].code, 'adapter.issue');
  assert.deepEqual(j.problems[0].resolutions, ['judge']);
});

test('SC-7 묶음 줄: 같은 새 코드 5건은 줄마다, 6건은 한 줄로 묶고 JSON은 모두 싣는다', () => {
  const five = [1, 2, 3, 4, 5].map((i) => issueCall('warn', 'tasks.unread-definition', `t${i}`));
  const six = [1, 2, 3, 4, 5, 6].map((i) => issueCall('warn', 'tasks.ambiguous-ref', `j1/s${Math.ceil(i / 2)}`));
  const dir = probeProject([...five, ...six].join('\n'));
  const r = run(dir, ['check']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.deepEqual(r.out.trimEnd().split('\n'), [
    ...[1, 2, 3, 4, 5].map((i) => `△ 표본: tasks.unread-definition t${i}`),
    '△ tasks.ambiguous-ref 6건(단계 3): livemap check --json',
    'map check: 통과 (경고 11)',
  ]);
  const j = run(dir, ['check', '--json']);
  assert.equal(j.code, 0);
  assert.equal(JSON.parse(j.out).problems.length, 11);
});

test('SC-7 묶음 줄: 코드 표에 없는 코드·기존 check 줄은 6건 이상이어도 묶지 않는다', () => {
  const custom = [1, 2, 3, 4, 5, 6].map((i) => issueCall('warn', 'project.custom-rule', `x${i}`));
  const dir = probeProject(custom.join('\n'));
  const r = run(dir, ['check']);
  assert.equal(r.out.trimEnd().split('\n').length, 7, r.out);
});

test('SC-7 --strict: tasks.*·judgment.* 경고를 오류로 세어 종료 코드 1, 없으면 0', () => {
  const dir = probeProject([issueCall('warn', 'tasks.stage-unknown', 't1'), issueCall('warn', 'router.unknown-api', 's1')].join('\n'));
  const plain = run(dir, ['check']);
  assert.equal(plain.code, 0, plain.out);
  const strict = run(dir, ['check', '--strict']);
  assert.equal(strict.code, 1, strict.out);
  assert.deepEqual(strict.out.trimEnd().split('\n'), ['✗ 표본: tasks.stage-unknown t1', '△ 표본: router.unknown-api s1', 'map check: 오류 1']);
  const js = run(dir, ['check', '--json', '--strict']);
  assert.equal(js.code, 1);
  const j = JSON.parse(js.out);
  assert.deepEqual([j.errors, j.warnings], [1, 1]);
  assert.deepEqual(j.problems.map((p) => [p.code, p.level]), [['tasks.stage-unknown', 'error'], ['router.unknown-api', 'warn']]);
  const other = probeProject(issueCall('warn', 'router.unknown-api', 's1'));
  assert.equal(run(other, ['check', '--strict']).code, 0);
});

test('SC-7 check --json: 프로젝트 어댑터가 참조 어댑터를 가려도 stdout은 JSON만이고 알림·어댑터 출력은 stderr', () => {
  const dir = probeProject("  console.log('어댑터가 찍은 줄');\n" + issueCall('warn', 'tasks.stage-unknown', 't1'), 'deploy');
  const text = run(dir, ['check']);
  assert.match(text.out, /^프로젝트 어댑터가 참조 어댑터를 가림: deploy$/m);
  const r = run(dir, ['check', '--json']);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.problems.length, 1);
  assert.match(r.err, /프로젝트 어댑터가 참조 어댑터를 가림: deploy/);
  assert.match(r.err, /어댑터가 찍은 줄/);
});

test('SC-7 check --json: errors가 텍스트 오류 수·종료 코드와 같다(mini 사본에 g.issue 오류 더함)', () => {
  const dir = tmp('mini 사본');
  cpSync(MINI, dir, { recursive: true });
  mkdirSync(join(dir, 'map/adapters'), { recursive: true });
  writeFileSync(join(dir, 'map/adapters/probe.mjs'), "export default function probe(g) { g.issue('error', '표본 오류', '필수 항목 없음', { code: 'judgment.invalid', anchors: [{ file: 'map/judgments/x.json', line: 1 }] }); return null; }\n");
  const cfgFile = join(dir, 'map/config.json');
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
  writeFileSync(cfgFile, JSON.stringify({ ...cfg, adapters: [...cfg.adapters, 'probe'] }, null, 2));
  const t = run(dir, ['check']);
  const j = run(dir, ['check', '--json']);
  const errors = Number(t.out.match(/map check: 오류 (\d+)/)[1]);
  assert.equal(JSON.parse(j.out).errors, errors);
  assert.equal(j.code, t.code);
  assert.match(t.out, /^✗ 표본 오류: 필수 항목 없음$/m);
});
