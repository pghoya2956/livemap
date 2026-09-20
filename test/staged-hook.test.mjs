// 커밋 전 훅 검사: livemap check --staged(스테이징된 작업 문서·판정 파일에 걸린 tasks.*·judgment.*만 오류로 센다)와
// livemap init의 .githooks/pre-commit·core.hooksPath 설치. 임시 git 저장소에서 bin을 자식 프로세스로 부르고 실제 git commit을 한다.
// 사용자·시스템 git 설정이 결과를 바꾸지 않게 GIT_CONFIG_GLOBAL을 빈 파일로, GIT_CONFIG_NOSYSTEM을 1로 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(resolve(HERE, '..'), 'bin', 'livemap.mjs');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (label) => { const d = mkdtempSync(join(tmpdir(), `livemap ${label} 검사-`)); made.push(d); return d; };
const EMPTY = join(tmp('git 설정'), 'gitconfig');
writeFileSync(EMPTY, '');
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: EMPTY, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };

const md = (...lines) => lines.join('\n') + '\n';
const write = (dir, files) => { for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), typeof text === 'string' ? text : JSON.stringify(text, null, 2) + '\n'); } };
const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: ENV });
const cli = (dir, args) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8', env: ENV }); return { code: r.status, out: r.stdout, err: r.stderr }; };

// 작업 어댑터만 도는 프로젝트. 진행 작업 하나는 이미 스펙 final에 표 결정 줄(기존 문제)을 가진다
const OLD_SPEC = md('# 옛 작업', '| DEC-3 | 표로 적은 옛 결정 |', '## 잔여 열린 질문', '', '없음: 모두 닫음');
const DONE_SPEC = md('# 완료 작업', '', '## 결정 사항', '', '| ID | 결정 |', '|---|---|', '| **DEC-1** | 결제 링크는 서버에서 만들고 만료 시간을 둔다 |', '', '## 잔여 열린 질문', '', '없음: 검토에서 모두 닫음');
const JUDGMENT = { schema: 1, task: '20260102-done', by: 'agent', lines: [{ at: { file: 'tasks/20260102-done/spec/final.md', text: '| **DEC-1** | 결제 링크는 서버에서 만들고' }, as: 'definition', id: 'DEC-1' }] };
function project({ repo = true } = {}) {
  const dir = tmp('훅 프로젝트');
  write(dir, {
    'map/config.json': JSON.stringify({ engine: 2, adapters: ['tasks'], tasks: { dir: 'tasks', index: 'tasks/index.md' }, semantic: 'map/semantic/journeys.json' }),
    'map/semantic/journeys.json': JSON.stringify({ journeys: [] }),
    'tasks/index.md': md('# 작업', '## 진행', '| [옛](20260101-old/spec/final.md) |', '## 완료', '| [완료](20260102-done/spec/final.md) |'),
    'tasks/20260101-old/spec/final.md': OLD_SPEC,
    'web/app.js': '// 코드\n',
  });
  if (repo) { git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base'); }
  return dir;
}

test('SC-12 check --staged: git 없음 0, 스테이징 없음 0, 코드 파일만 스테이징 0', () => {
  const nogit = project({ repo: false });
  const r0 = cli(nogit, ['check', '--staged']);
  assert.equal(r0.code, 0, r0.out + r0.err);
  assert.match(r0.out, /git 저장소 아님/);

  const dir = project();
  const r1 = cli(dir, ['check', '--staged']);
  assert.deepEqual([r1.code, r1.out.trim()], [0, 'map check --staged: 대상 없음']);
  write(dir, { 'web/app.js': '// 코드 바꿈\n', 'tasks/roadmap.md': '# 로드맵\n' });
  git(dir, 'add', 'web/app.js', 'tasks/roadmap.md');
  const r2 = cli(dir, ['check', '--staged']);
  assert.deepEqual([r2.code, r2.out.trim()], [0, 'map check --staged: 대상 없음']);
  // 스테이징하지 않은 작업 문서 변경도 보지 않는다
  write(dir, { 'tasks/20260102-done/spec/final.md': DONE_SPEC });
  assert.equal(cli(dir, ['check', '--staged']).code, 0);
});

test('SC-12 check --staged: 스테이징된 작업 폴더의 tasks.*는 1(코드·처리·판정 초안 출력), 다른 작업 폴더의 기존 문제는 0, 판정 파일만 스테이징해 judgment.invalid면 1', () => {
  const dir = project();
  // 옛 작업의 기존 문제는 스테이징되지 않아 세지 않는다
  assert.equal(cli(dir, ['check']).out.includes('표 첫 칸의 결정 번호'), true);
  write(dir, { 'tasks/20260102-done/spec/final.md': DONE_SPEC });
  git(dir, 'add', 'tasks/20260102-done');
  const r = cli(dir, ['check', '--staged']);
  assert.equal(r.code, 1, r.out + r.err);
  const lines = r.out.trim().split('\n');
  assert.equal(lines[0], '✗ tasks.unread-definition 작업 문서: 스펙 final 표 첫 칸의 결정 번호 1줄을 규칙으로 읽지 않음');
  assert.ok(lines.includes('  처리: source·judge'), r.out);
  assert.ok(lines.includes('  근거: tasks/20260102-done/spec/final.md:7 | **DEC-1** | 결제 링크는 서버에서 만들고 만료 시간을 둔다 |'), r.out);
  assert.ok(lines.includes('  판정 초안(judgmentDraft): {"task":"20260102-done","lines":[{"at":null,"as":null,"id":"DEC-1"}]}'), r.out);
  assert.match(lines.at(-1), /^map check --staged: 오류 1 /);
  assert.equal(r.out.includes('20260101-old'), false);
  // --json: 고른 문제만 error로
  const j = JSON.parse(cli(dir, ['check', '--staged', '--json']).out);
  assert.deepEqual([j.errors, j.warnings, j.problems.map((p) => [p.level, p.code, p.subject.id])], [1, 0, [['error', 'tasks.unread-definition', '20260102-done']]]);

  // 같은 커밋에 판정 파일을 더하면 통과
  write(dir, { 'map/judgments/20260102-done.json': JUDGMENT });
  git(dir, 'add', 'map/judgments');
  const ok = cli(dir, ['check', '--staged']);
  assert.deepEqual([ok.code, ok.out.trim()], [0, 'map check --staged: 통과 (대상 파일 2)']);
  git(dir, 'commit', '-qm', 'done');

  // 판정 파일만 스테이징: 조각이 두 줄에 맞으면 judgment.invalid로 1
  write(dir, { 'map/judgments/20260102-done.json': { ...JUDGMENT, lines: [{ at: { file: 'tasks/20260102-done/spec/final.md', text: '같은 문장을 두 번 적은 문단 줄이 여기에 있다' }, as: 'ignore' }] } });
  write(dir, { 'tasks/20260102-done/spec/final.md': DONE_SPEC + md('', '같은 문장을 두 번 적은 문단 줄이 여기에 있다', '', '같은 문장을 두 번 적은 문단 줄이 여기에 있다') });
  git(dir, 'add', 'map/judgments');
  const inv = cli(dir, ['check', '--staged']);
  assert.equal(inv.code, 1, inv.out);
  assert.match(inv.out, /^✗ judgment\.invalid 판정 파일: 근거 조각을 가진 줄이 2개: tasks\/20260102-done\/spec\/final\.md$/m);
});

test('SC-12 livemap init 훅: 새 저장소에 .githooks/pre-commit(실행 권한)과 core.hooksPath, 두 번 실행해도 변경 없음, git 밖에서는 훅을 건너뛴다', () => {
  const dir = tmp('init 훅');
  write(dir, { 'package.json': { name: 'sample', version: '1.0.0', scripts: {} } });
  git(dir, 'init', '-q', '-b', 'main');
  const r1 = cli(dir, ['init']);
  assert.equal(r1.code, 0, r1.err);
  assert.match(r1.out, /^\+ \.githooks\/pre-commit$/m);
  assert.match(r1.out, /^\+ git config core\.hooksPath \.githooks$/m);
  const hook = join(dir, '.githooks/pre-commit');
  assert.match(readFileSync(hook, 'utf8'), /^#!\/bin\/sh\n[\s\S]*^npx --no livemap check --staged$/m);
  assert.equal(statSync(hook).mode & 0o111, 0o111);
  assert.equal(git(dir, 'config', '--get', 'core.hooksPath').stdout.trim(), '.githooks');
  // 기존 init 동작 그대로
  for (const f of ['map/config.json', 'map/semantic/journeys.json', 'map/README.md', 'map/captures/README.md', '.gitignore']) assert.ok(existsSync(join(dir, f)), f);
  const snapshot = () => [readFileSync(hook, 'utf8'), statSync(hook).mode, git(dir, 'config', '--list', '--local').stdout, readFileSync(join(dir, 'package.json'), 'utf8')].join('\n---\n');
  const before = snapshot();
  const r2 = cli(dir, ['init']);
  assert.equal(r2.code, 0);
  assert.match(r2.out, /livemap init: 변경 없음/);
  assert.equal(snapshot(), before);

  const plain = tmp('init git 밖');
  const r3 = cli(plain, ['init']);
  assert.equal(r3.code, 0);
  assert.match(r3.out, /^! git 저장소 아님: 커밋 전 훅을 설치하지 않음/m);
  assert.equal(existsSync(join(plain, '.githooks')), false);
});

test('SC-12 livemap init 훅: 기존 core.hooksPath·.husky·lefthook.yml·.pre-commit-config.yaml·.git/hooks/pre-commit이 있으면 덮지 않고 넣을 한 줄을 출력한다', () => {
  const cases = {
    hooksPath: (dir) => git(dir, 'config', 'core.hooksPath', '.hooks'),
    husky: (dir) => write(dir, { '.husky/pre-commit': 'npm test\n' }),
    lefthook: (dir) => write(dir, { 'lefthook.yml': 'pre-commit:\n  commands: {}\n' }),
    preCommit: (dir) => write(dir, { '.pre-commit-config.yaml': 'repos: []\n' }),
    gitHook: (dir) => write(dir, { '.git/hooks/pre-commit': '#!/bin/sh\nexit 0\n' }),
  };
  for (const [name, arrange] of Object.entries(cases)) {
    const dir = tmp(`init 기존 훅 ${name}`);
    git(dir, 'init', '-q', '-b', 'main');
    arrange(dir);
    const hooksPath = git(dir, 'config', '--get', 'core.hooksPath').stdout;
    const r1 = cli(dir, ['init']);
    assert.equal(r1.code, 0, name);
    assert.match(r1.out, /^! 커밋 전 훅: 기존 .+이 있어 덮지 않음\. pre-commit 단계에 넣을 줄: npx --no livemap check --staged$/m, `${name}: ${r1.out}`);
    assert.equal(existsSync(join(dir, '.githooks')), false, name);
    assert.equal(git(dir, 'config', '--get', 'core.hooksPath').stdout, hooksPath, name);
    const r2 = cli(dir, ['init']);
    assert.match(r2.out, /livemap init: 변경 없음/, name);
  }
});

test('SC-12 커밋 전 훅: 실제 git commit에서 표 결정 완료 작업 커밋은 exit 1로 멈추고, 판정 파일을 더하면 통과, 코드 파일만 바꾼 커밋 통과', () => {
  const dir = project();
  // 훅의 npx --no livemap이 이 엔진을 찾게 로컬 bin을 둔다
  write(dir, { 'package.json': { name: 'sample', version: '1.0.0', private: true }, '.gitignore': 'node_modules/\nmap/.out/\n' });
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true });
  symlinkSync(BIN, join(dir, 'node_modules/.bin/livemap'));
  assert.equal(cli(dir, ['init']).code, 0);
  git(dir, 'add', '-A');
  assert.equal(git(dir, 'commit', '-qm', 'init').status, 0);

  write(dir, { 'tasks/20260102-done/spec/final.md': DONE_SPEC });
  git(dir, 'add', 'tasks/20260102-done', 'tasks/index.md');
  const c1 = git(dir, 'commit', '-qm', 'done');
  assert.equal(c1.status, 1, c1.stdout + c1.stderr);
  const out = c1.stdout + c1.stderr;
  assert.match(out, /tasks\.unread-definition/);
  assert.match(out, /판정 초안/);
  assert.equal(git(dir, 'log', '--format=%s', '-1').stdout.trim(), 'init');

  write(dir, { 'map/judgments/20260102-done.json': JUDGMENT });
  git(dir, 'add', 'map/judgments', 'tasks/20260102-done', 'tasks/index.md');
  const c2 = git(dir, 'commit', '-qm', 'done-judged');
  assert.equal(c2.status, 0, c2.stdout + c2.stderr);

  write(dir, { 'web/app.js': '// 코드 바꿈\n' });
  git(dir, 'add', 'web');
  const c3 = git(dir, 'commit', '-qm', 'code');
  assert.equal(c3.status, 0, c3.stdout + c3.stderr);
  assert.deepEqual(git(dir, 'log', '--format=%s').stdout.trim().split('\n'), ['code', 'done-judged', 'init', 'base']);
});

// 구조 지도(2.1.0, DEC-37): map/architecture/ 아래 파일, architecture.skillFile, map/config.json 중 하나가 스테이징됐을 때만 architecture.* 를 오류로 센다.
// 코드 파일이 스테이징됐다는 이유로 구조 검사를 돌리지 않고 훅 안에서 Graphify 를 돌리지도 않는다
function archProject() {
  const dir = tmp('훅 구조');
  write(dir, {
    'map/config.json': JSON.stringify({ engine: 2, adapters: ['probe'], semantic: 'map/semantic/journeys.json', architecture: { dir: 'map/architecture', graph: 'graphify-out/graph.json', skillFile: '.claude/skills/sample-architecture/SKILL.md' } }),
    'map/semantic/journeys.json': JSON.stringify({ journeys: [] }),
    'map/adapters/probe.mjs': "export default function probe(g) { g.issue('warn', '구조 규칙', 'web/src/lib/a.ts → web/src/pages/B.tsx: 층 lib 는 pages 를 가져올 수 없다', { code: 'architecture.layer-violation', subject: { kind: 'module', id: 'web/src/lib/a.ts' }, anchors: [{ file: 'web/src/lib/a.ts' }] }); g.issue('warn', '작업', '무관한 경고', { code: 'tasks.stage-unknown', subject: { kind: 'task', id: '20260101-x' } }); return null; }\n",
    'map/architecture/README.md': md('# 시스템 그림', '', '```mermaid', 'flowchart LR', '  web["웹"]', '```', '', '| 부품 | 파일 | 이름 | 종류 |', '|---|---|---|---|', '| web | [web.md](web.md) | 웹 | 우리 코드 |'),
    'map/architecture/web.md': md('# 웹', '- id: web', '- 폴더: web/src'),
    '.claude/skills/sample-architecture/SKILL.md': md('# 구조', '사본'),
    'web/src/lib/a.ts': '// 코드\n',
  });
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base');
  return dir;
}
test('SC-13 check --staged: 코드 파일만 스테이징이면 대상 없음, 선언 파일·설정·스킬 사본이 스테이징되면 architecture.* 만 오류(다른 경고는 세지 않음)', () => {
  const dir = archProject();
  assert.match(cli(dir, ['check']).out, /architecture\.layer-violation|층 lib/);
  write(dir, { 'web/src/lib/a.ts': '// 코드 바꿈\n' });
  git(dir, 'add', 'web/src/lib/a.ts');
  assert.deepEqual([cli(dir, ['check', '--staged']).code, cli(dir, ['check', '--staged']).out.trim()], [0, 'map check --staged: 대상 없음']);
  git(dir, 'reset', '-q');
  for (const f of ['map/architecture/web.md', 'map/config.json', '.claude/skills/sample-architecture/SKILL.md']) {
    write(dir, { [f]: readFileSync(join(dir, f), 'utf8') + '\n' });
    git(dir, 'add', f);
    const r = cli(dir, ['check', '--staged']);
    assert.equal(r.code, 1, `${f}: ${r.out}${r.err}`);
    const lines = r.out.trim().split('\n');
    assert.equal(lines[0], '✗ architecture.layer-violation 구조 규칙: web/src/lib/a.ts → web/src/pages/B.tsx: 층 lib 는 pages 를 가져올 수 없다', f);
    assert.ok(lines.includes('  처리: source·code'), f);
    assert.equal(r.out.includes('tasks.stage-unknown'), false, f);
    assert.match(lines.at(-1), /^map check --staged: 오류 1 /, f);
    const j = JSON.parse(cli(dir, ['check', '--staged', '--json']).out);
    assert.deepEqual([j.errors, j.problems.map((p) => p.code)], [1, ['architecture.layer-violation']], f);
    git(dir, 'reset', '-q');
  }
});
