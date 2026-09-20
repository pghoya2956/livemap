// 산출물 검사(스펙 PN-31~PN-35, 「map/.out/architecture.md 산출물」「API / 인터페이스」): 절 여덟의 순서, Mermaid flowchart 하나와 sequenceDiagram 하나 이상,
// 상한 8,000바이트와 architecture.out-too-long, 기능 고르기(현재 마일스톤 우선·노드 수 차선), 사본 frontmatter 와 본문 바이트 동일, architecture.skill-stale,
// architecture.json(symbols 와 심볼 사이 calls·reads), build 요약 줄, export 두 파일(없어도 성공), init 템플릿. mini 픽스처를 임시 폴더로 복사해 설정을 덧댄다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';
import { renderArchitectureMd, skillCopy, skillBody, selectFlows, architectureJson, OUT_LIMIT, SECTION_TITLES, DEFAULT_SEQUENCE } from '../src/reporters/architecture-md.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const BIN = join(PKG, 'bin', 'livemap.mjs');
const MINI = join(HERE, 'fixtures', 'mini');
const VERSION = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (label) => { const d = mkdtempSync(join(tmpdir(), `livemap ${label} 검사-`)); made.push(d); return d; };
const EMPTY = join(tmp('git 설정'), 'gitconfig');
writeFileSync(EMPTY, '');
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: EMPTY, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
const run = (cwd, args) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: ENV }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: ENV });
const bytes = (s) => Buffer.byteLength(s, 'utf8');
function project(patch = (c) => c) {
  const dir = tmp('산출물');
  cpSync(MINI, dir, { recursive: true });
  const f = join(dir, 'map/config.json');
  writeFileSync(f, JSON.stringify(patch(JSON.parse(readFileSync(f, 'utf8'))), null, 2) + '\n');
  return dir;
}
const SKILL = '.claude/skills/demo-architecture/SKILL.md';
const { g, data } = await buildGraph(MINI);

test('SC-15 산출물: 절 여덟이 순서대로 있고 Mermaid 블록이 flowchart 하나와 sequenceDiagram 하나 이상, 상한 8,000바이트 안', () => {
  const r = renderArchitectureMd(data, { version: VERSION });
  assert.deepEqual(SECTION_TITLES, ['부품', '시스템 그림', '규칙', '기능', '기능별 호출 흐름', '어긋남과 끊김', '어디를 고치나']);
  const headings = r.text.split('\n').filter((l) => /^#{1,2} /.test(l));
  assert.match(headings[0], /^# 구조: Mini$/);
  assert.deepEqual(headings.slice(1), SECTION_TITLES.map((t) => `## ${t}`));
  // 머리 한 줄: 부품·묶음·기능·규칙·어긋남 수, 생성 시각, 엔진 판과 Graphify 판
  const head = r.text.split('\n')[2];
  assert.match(head, new RegExp(`부품 4 · 묶음 \\d+ · 기능 1 · 규칙 \\d+ · 어긋남 0 · 생성 \\d{4}-\\d{2}-\\d{2}T.* · livemap ${VERSION.replace(/\\./g, '\\\\.')} · Graphify`));
  assert.equal((r.text.match(/^```mermaid$/gm) || []).length, 2);
  assert.match(r.text, /^flowchart LR$/m);
  assert.match(r.text, /^sequenceDiagram$/m);
  assert.equal(r.text.startsWith('---'), false, '사본 frontmatter 와 구분되게 본문은 --- 로 시작하지 않는다');
  assert.ok(r.bytes <= OUT_LIMIT && r.bytes === bytes(r.text));
  assert.deepEqual([r.tooLong, r.sequenceCount, r.flowsTotal, OUT_LIMIT, DEFAULT_SEQUENCE], [false, 1, 1, 8000, 'fit']);
  // 부품 표에 id·이름·경계·종류·폴더·수, 그림에 subgraph 경계와 부품, 기능 표에 기능 한 줄
  assert.match(r.text, /^\| web \| 웹 화면 \| browser \| 우리 코드 \| web\/src \| 화면 2 · 파일 \d+ · 심볼 \d+ \|$/m);
  assert.match(r.text, /subgraph browser\["브라우저"\]/);
  assert.match(r.text, /^  web --> bff$/m);
  assert.match(r.text, /^\| live-flow \| 동작 장면 \| live \| 화면 1 · API 1 · DB 함수 1 · 테이블 1 \|$/m);
  // 규칙 절: 지켜짐·어긋남·선언만 셋으로 나눈다
  assert.match(r.text, /지켜짐/); assert.match(r.text, /어긋남/); assert.match(r.text, /선언만/);
  assert.match(r.text, /pages → lib/);
  // 어디를 고치나: 구조 정본 폴더·설정·여정 정본
  assert.match(r.text, /map\/architecture\//); assert.match(r.text, /map\/config\.json/); assert.match(r.text, /map\/semantic\/journeys\.json/);
});

test('SC-15 상한: fit 모드는 상한 안에서 기준 순서로 sequenceDiagram 을 채우고, 고정 개수로 바꿀 수 있으며, 넘으면 tooLong', () => {
  const fit = renderArchitectureMd(data, { version: VERSION, limit: 1500 });
  assert.deepEqual([fit.sequenceCount, fit.tooLong && fit.bytes > 1500], [0, fit.tooLong]);
  const fixed = renderArchitectureMd(data, { version: VERSION, limit: 1500, sequence: 1 });
  assert.equal(fixed.sequenceCount, 1);
  assert.equal(fixed.tooLong, fixed.bytes > 1500);
  const tiny = renderArchitectureMd(data, { version: VERSION, limit: 100 });
  assert.equal(tiny.tooLong, true);
});

test('SC-15 기능 고르기: 현재 마일스톤(진행, 없으면 다음) 소속이 먼저, 그 다음 지나는 노드 수, 동작 상태는 쓰지 않는다', () => {
  const flows = [
    { id: 'a', step: 'j1/s1', status: 'planned', nodes: ['x', 'y', 'z'] },
    { id: 'b', step: 'j1/s2', status: 'live', nodes: Array.from({ length: 10 }, (_, i) => `n${i}`) },
    { id: 'c', step: 'j1/s3', status: 'live', nodes: ['p', 'q', 'r', 's', 't'] },
    { id: 'd', step: 'j1/s9', status: 'live', nodes: ['u', 'v', 'w', 'x', 'y', 'z'] },
  ];
  const d = { roadmap: [{ id: 'i1', milestone: 'm1', scenes: [{ ref: 'j1/s1' }] }, { id: 'i2', milestone: 'm2', scenes: [{ ref: 'j1/s2' }, { ref: 'j1/s3' }] }], milestones: [{ id: 'm1', status: '진행' }, { id: 'm2', status: '다음' }] };
  assert.deepEqual(selectFlows(flows, d).map((f) => f.id), ['a', 'b', 'd', 'c']);
  // 진행 마일스톤이 없으면 다음이 현재다
  const d2 = { ...d, milestones: [{ id: 'm1', status: '완료' }, { id: 'm2', status: '다음' }] };
  assert.deepEqual(selectFlows(flows, d2).map((f) => f.id), ['b', 'c', 'd', 'a']);
  assert.deepEqual(selectFlows(flows, { roadmap: [], milestones: [] }).map((f) => f.id), ['b', 'd', 'c', 'a']);
});

test('SC-16 사본: frontmatter 두 줄(name 은 skillFile 폴더 이름, description 한 줄)을 얹고 닫는 --- 다음 줄부터 산출물과 바이트가 같다', () => {
  const md = renderArchitectureMd(data, { version: VERSION }).text;
  const copy = skillCopy(md, { name: 'demo-architecture', project: 'Mini' });
  const lines = copy.split('\n');
  assert.deepEqual(lines.slice(0, 4), ['---', 'name: demo-architecture', 'description: 「Mini」이 무엇으로 되어 있나. 부품·경계·규칙·기능별 호출 흐름. 화면·API·DB를 바꾸기 전에 읽는다.', '---']);
  assert.equal(skillBody(copy), md);
  assert.equal(skillBody('no frontmatter'), null);
});

test('SC-15 architecture.json: symbols[] 와 심볼 사이 calls·reads 엣지만(함수 수준은 data.json 에 싣지 않는다, DEC-39)', () => {
  const j = architectureJson(g);
  assert.ok(j.symbols.length >= 7);
  for (const s of j.symbols) assert.deepEqual(Object.keys(s), ['id', 'module', 'line', 'callable', 'community']);
  assert.ok(j.symbols.some((s) => s.id === 'web/src/pages/Live.tsx:Live' && s.module === 'web/src/pages/Live.tsx' && s.callable === true && s.community === 1));
  assert.ok(j.edges.every((e) => ['calls', 'reads'].includes(e.kind) && e.from.startsWith('symbol:') && e.to.startsWith('symbol:')));
  assert.ok(j.edges.some((e) => e.from === 'symbol:web/src/pages/Live.tsx:Live' && e.to === 'symbol:web/src/lib/queries.ts:useResorts' && e.kind === 'calls' && e.confidence === 'EXTRACTED'));
  assert.equal(j.symbols.some((s) => s.id === 'auth.users'), false, '바깥 상대 SQL 심볼은 함수 수준 자료가 아니다');
  assert.equal('symbols' in data.architecture, false);
});

test('SC-15·SC-21 명령: build 가 architecture.md·architecture.json 을 쓰고 요약 줄에 부품·묶음·어긋남을 더한다', () => {
  const dir = project();
  const b = run(dir, ['build']);
  assert.equal(b.code, 0, b.err);
  assert.match(b.out, /map build → .*화면 2 · API 3 · 함수 2 · 부품 4 · 묶음 \d+ · 작업 1 · 커밋 \d+ · 경고 \d+ · 고아 \d+ · 어긋남 0$/m);
  const md = readFileSync(join(dir, 'map/.out/architecture.md'), 'utf8');
  assert.ok(bytes(md) <= OUT_LIMIT);
  assert.equal((md.match(/^```mermaid$/gm) || []).length, 2);
  const j = JSON.parse(readFileSync(join(dir, 'map/.out/architecture.json'), 'utf8'));
  assert.ok(j.symbols.length > 0 && Array.isArray(j.edges));
  assert.equal(existsSync(join(dir, SKILL)), false, 'skillFile 이 없으면 사본을 쓰지 않는다');
});

test('SC-16 명령: skillFile 을 두면 build 가 사본을 쓰고 본문이 같다. 사본을 고치면 architecture.skill-stale, 스테이징하면 --staged 오류. outLimit 을 넘으면 architecture.out-too-long', () => {
  const dir = project((c) => ({ ...c, architecture: { ...c.architecture, skillFile: SKILL } }));
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base');
  assert.equal(run(dir, ['build']).code, 0);
  const copy = readFileSync(join(dir, SKILL), 'utf8');
  const md = readFileSync(join(dir, 'map/.out/architecture.md'), 'utf8');
  assert.match(copy, /^---\nname: demo-architecture\ndescription: 「Mini」이 무엇으로 되어 있나\. .*\n---\n/);
  assert.equal(skillBody(copy), md);
  const codesOf = (args) => JSON.parse(run(dir, args).out).problems.filter((p) => p.code.startsWith('architecture.')).map((p) => p.code);
  assert.equal(codesOf(['check', '--json']).includes('architecture.skill-stale'), false);
  writeFileSync(join(dir, SKILL), copy.slice(0, -1) + 'X');
  const stale = JSON.parse(run(dir, ['check', '--json']).out).problems.filter((p) => p.code === 'architecture.skill-stale');
  assert.equal(stale.length, 1);
  assert.deepEqual([stale[0].level, stale[0].subject, stale[0].anchors[0].file, stale[0].resolutions], ['warn', { kind: 'config', id: 'architecture.skillFile' }, SKILL, ['source']]);
  // 스테이징하면 --staged 가 오류로 센다(DEC-37)
  git(dir, 'add', SKILL);
  const staged = run(dir, ['check', '--staged']);
  assert.equal(staged.code, 1, staged.out + staged.err);
  assert.match(staged.out, /^✗ architecture\.skill-stale /m);
  // 사본이 없으면(지웠거나 아직 빌드 전) 낡음으로 본다: 빌드하고 커밋하라는 신호
  rmSync(join(dir, SKILL));
  assert.equal(codesOf(['check', '--json']).filter((c) => c === 'architecture.skill-stale').length, 1);
  // 상한: outLimit 을 작게 두면 out-too-long 경고. fit 모드라 sequenceDiagram 은 0 이 되고 그래도 넘으면 경고다
  const small = project((c) => ({ ...c, architecture: { ...c.architecture, outLimit: 300 } }));
  assert.equal(run(small, ['build']).code, 0);
  const tooLong = JSON.parse(run(small, ['check', '--json']).out).problems.filter((p) => p.code === 'architecture.out-too-long');
  assert.equal(tooLong.length, 1);
  assert.match(tooLong[0].msg, /300/);
  assert.equal((readFileSync(join(small, 'map/.out/architecture.md'), 'utf8').match(/^sequenceDiagram$/gm) || []).length, 0);
  // 고정 개수 설정
  const fixed = project((c) => ({ ...c, architecture: { ...c.architecture, sequenceDiagrams: 1, outLimit: 300 } }));
  assert.equal(run(fixed, ['build']).code, 0);
  assert.equal((readFileSync(join(fixed, 'map/.out/architecture.md'), 'utf8').match(/^sequenceDiagram$/gm) || []).length, 1);
});

test('SC-15 명령: export 가 data 폴더에 두 파일을 담고, 그래프·선언이 없는 프로젝트에서는 두 파일 없이도 export 가 성공한다', () => {
  const dir = project();
  assert.equal(run(dir, ['build']).code, 0);
  assert.equal(run(dir, ['export', 'map/.out/site']).code, 0);
  for (const f of ['data/architecture.md', 'data/architecture.json', 'data/data.json']) assert.ok(existsSync(join(dir, 'map/.out/site', f)), f);
  const off = project((c) => { const { architecture, ...rest } = c; return { ...rest, adapters: c.adapters.filter((a) => a !== 'graphify') }; });
  const b = run(off, ['build']);
  assert.equal(b.code, 0, b.err);
  assert.equal(b.out.includes('부품'), false, '구조 지도가 꺼진 프로젝트의 요약 줄은 2.0.2 그대로');
  assert.equal(existsSync(join(off, 'map/.out/architecture.md')), false);
  const e = run(off, ['export', 'map/.out/site']);
  assert.equal(e.code, 0, e.out + e.err);
  assert.equal(existsSync(join(off, 'map/.out/site/data/architecture.md')), false);
});

test('P4-06 init: 없는 architecture 템플릿(README 그림·부품 파일 틀)만 만들고 다시 실행해도 바꾸지 않는다', () => {
  const dir = tmp('init 구조');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sample', version: '1.0.0', scripts: {} }));
  git(dir, 'init', '-q', '-b', 'main');
  const r1 = run(dir, ['init']);
  assert.equal(r1.code, 0, r1.err);
  assert.match(r1.out, /^\+ map\/architecture\/README\.md$/m);
  const readme = join(dir, 'map/architecture/README.md');
  assert.ok(existsSync(readme));
  assert.ok(existsSync(join(dir, 'map/architecture/web.md')));
  assert.match(readFileSync(readme, 'utf8'), /```mermaid\nflowchart LR/);
  assert.match(readFileSync(readme, 'utf8'), /\| 부품 \| 파일 \| 이름 \| 종류 \|/);
  writeFileSync(readme, readFileSync(readme, 'utf8') + 'keep\n');
  const r2 = run(dir, ['init']);
  assert.match(r2.out, /livemap init: 변경 없음/);
  assert.match(readFileSync(readme, 'utf8'), /keep\n$/);
  // 템플릿에 표본 이름·사용자 경로가 없다: 유출 패턴 파일(scripts/leak-patterns.txt)을 그대로 쓴다
  const leak = new RegExp(readFileSync(join(PKG, 'scripts/leak-patterns.txt'), 'utf8').trim(), 'i');
  for (const f of ['templates/architecture/README.md', 'templates/architecture/web.md']) assert.equal(leak.test(readFileSync(join(PKG, f), 'utf8')), false, `${f} 에 표본 이름 없음`);
});
