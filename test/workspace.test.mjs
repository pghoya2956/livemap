// 여러 저장소 워크스페이스 검사: 표식 읽개(src/lib/repos-marker.mjs)와 어긋남 R1~R4, 자식 설정 세 갈래와 병합,
// 워크스페이스 단계(src/workspace.mjs)의 추출·접두·저장소 절, buildGraph 연결과 check --staged·affected 의 자식 건너뜀, repos.* 코드 표.
// 통합 검사는 test/fixtures/workspace 를 makeWorkspace 로 임시 폴더에 펼쳐(자식 app·svc 와 상위가 각자 git 저장소) bin/livemap.mjs 를 자식 프로세스로 부른다.
// 테스트 이름 머리의 SC-n 은 스펙 성공 기준 번호다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWorkspace, git } from './helpers/workspace-fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const BIN = join(PKG, 'bin', 'livemap.mjs');
const VERSION = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;
const MARKER = '.agent/repos.yaml';

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (label) => { const d = mkdtempSync(join(tmpdir(), `livemap ${label} 검사-`)); made.push(d); return d; };
const ws = () => makeWorkspace({ dir: tmp('워크스페이스') });
const run = (cwd, args, env = process.env) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const data = (root) => readJson(join(root, 'map/.out/data.json'));
const graph = (root) => readJson(join(root, 'map/.out/graph.json'));
const editJson = (file, fn) => { const j = readJson(file); fn(j); writeFileSync(file, JSON.stringify(j, null, 2) + '\n'); };
const checkJson = (root, extra = []) => { const r = run(root, ['check', '--json', ...extra]); return { code: r.code, err: r.err, ...JSON.parse(r.out) }; };
const reposCodes = (j) => j.problems.filter((p) => p.code.startsWith('repos.'));
// 폴더 아래 파일 목록(.git 제외)
const listFiles = (dir, rel = '') => readdirSync(join(dir, rel)).flatMap((name) => {
  if (name === '.git') return [];
  const r = rel ? `${rel}/${name}` : name;
  return statSync(join(dir, r)).isDirectory() ? listFiles(dir, r) : [r];
}).sort();
const marker = () => import('../src/lib/repos-marker.mjs');
const workspace = () => import('../src/workspace.mjs');

// ── 표식 읽개 ───────────────────────────────────────────────────────────────

test('표식 읽개: root·repos 절, 따옴표 한 쌍, 주석·빈 줄, / 가 든 path', async () => {
  const { parseMarker } = await marker();
  const r = parseMarker(['# 표식', '', 'root:', '  url: "git@example.com:o/top.git"', "  branch: 'main'", 'repos:', '  - path: api', '    url: git@example.com:o/api.git', '    branch: main', '    role: API 저장소', '  # 들여쓴 주석', '  - path: apps/web', '    role: "웹"'].join('\n'));
  assert.equal(r.error, null);
  assert.deepEqual(r.root, { url: 'git@example.com:o/top.git', branch: 'main' });
  assert.deepEqual(r.repos, [
    { path: 'api', url: 'git@example.com:o/api.git', branch: 'main', role: 'API 저장소' },
    { path: 'apps/web', url: '', branch: '', role: '웹' },
  ]);
});

test('표식 읽개: 항목 밖 두 칸 키는 7행 형식 오류, 빈 path 와 절 밖 항목도 형식 오류', async () => {
  const { parseMarker } = await marker();
  // repos-audit.py --self-test 13번과 같은 입력: 여섯째 줄 항목 뒤에 두 칸 url 을 끼운다
  const lines = ['# .agent/repos.yaml', 'root:', '  url: git@example.com:o/bad.git', '  branch: main', 'repos:', '  - path: api', '    url: git@example.com:o/api.git', '    branch: main', '    role: api 역할'];
  lines.splice(6, 0, '  url: git@example.com:o/loose.git');
  assert.deepEqual(parseMarker(lines.join('\n')), { root: {}, repos: [], error: { line: 7, text: '  url: git@example.com:o/loose.git' } });
  assert.deepEqual(parseMarker('repos:\n  - path: ""\n').error, { line: 2, text: '  - path: ""' });
  assert.deepEqual(parseMarker('  - path: api\n').error, { line: 1, text: '  - path: api' });
  assert.deepEqual(parseMarker('repos:\n    url: x\n').error, { line: 2, text: '    url: x' });
});

// 판정 사례(repos-audit.py --self-test 와 같은 모양): 임시 폴더에 상위와 자식 저장소를 만든다
const URL = (name) => `git@example.com:o/${name}.git`;
function writeMarker(root, entries, rootUrl) {
  const lines = ['# .agent/repos.yaml'];
  if (rootUrl != null) lines.push('root:', `  url: ${rootUrl}`, '  branch: main');
  lines.push('repos:');
  for (const [path, url] of entries) lines.push(`  - path: ${path}`, `    url: ${url}`, '    branch: main', `    role: ${path} 역할`);
  mkdirSync(join(root, '.agent'), { recursive: true });
  writeFileSync(join(root, MARKER), lines.join('\n') + '\n');
}
function repo(dir, url) { mkdirSync(dir, { recursive: true }); git(dir, 'init', '-q'); if (url) git(dir, 'remote', 'add', 'origin', url); }
function auditProject(name, { children = ['api', 'web'], rootUrl = URL(name), gitRoot = true } = {}) {
  const root = join(tmp('표식 판정'), name);
  mkdirSync(root);
  if (gitRoot) repo(root, rootUrl || null);
  for (const c of children) repo(join(root, c), URL(c));
  writeMarker(root, children.map((c) => [c, URL(c)]), rootUrl);
  return root;
}
const R_KEYS = ['R1', 'R2', 'R3', 'R4'];
const only = (f, key, items) => { assert.equal(f.error, null); assert.deepEqual(f[key], items); for (const k of R_KEYS) if (k !== key) assert.deepEqual(f[k], [], k); };

test('어긋남 판정: 정합 0건, R1 폴더 없음·.git 없음·root, R2(숨김·.git 없는 폴더 제외)', async () => {
  const { auditRepos } = await marker();
  const clean = auditRepos(auditProject('clean'));
  assert.equal(clean.worktree, false);
  for (const k of R_KEYS) assert.deepEqual(clean[k], [], k);
  assert.deepEqual(clean.repos.map((r) => r.path), ['api', 'web']);

  let root = auditProject('r1-missing');
  writeMarker(root, [['api', URL('api')], ['web', URL('web')], ['gone', URL('gone')]], URL('r1-missing'));
  only(auditRepos(root), 'R1', [{ path: 'gone', why: 'missing' }]);

  root = auditProject('r1-nogit', { children: ['api'] });
  mkdirSync(join(root, 'web'));
  writeFileSync(join(root, 'web/index.html'), 'x');
  writeMarker(root, [['api', URL('api')], ['web', URL('web')]], URL('r1-nogit'));
  only(auditRepos(root), 'R1', [{ path: 'web', why: 'no-git' }]);

  only(auditRepos(auditProject('r1-root', { gitRoot: false })), 'R1', [{ path: '.', why: 'no-git' }]);

  root = auditProject('r2');
  repo(join(root, 'extra'), URL('extra'));
  repo(join(root, '.hidden'), URL('hidden'));
  mkdirSync(join(root, 'plain'));
  only(auditRepos(root), 'R2', [{ path: 'extra' }]);
});

test('어긋남 판정: R3 상위 색인의 자식 파일·gitlink, R4 자식·root 불일치, url 빈 항목 건너뜀, origin 없음은 R4', async () => {
  const { auditRepos } = await marker();
  let root = auditProject('r3');
  git(root, 'update-index', '--add', '--cacheinfo', '100644,e69de29bb2d1d6434b8b29ae775ad8c2e48c5391,api/src/x.py');
  git(root, 'update-index', '--add', '--cacheinfo', '160000,0123456789012345678901234567890123456789,web');
  only(auditRepos(root), 'R3', [{ path: 'api', files: 1 }, { path: 'web', files: 1 }]);

  root = auditProject('r4-child');
  git(join(root, 'web'), 'remote', 'set-url', 'origin', 'git@example.com:other/web.git');
  only(auditRepos(root), 'R4', [{ path: 'web', listed: URL('web'), actual: 'git@example.com:other/web.git' }]);

  root = auditProject('r4-root');
  git(root, 'remote', 'set-url', 'origin', 'git@example.com:other/r4-root.git');
  only(auditRepos(root), 'R4', [{ path: '.', listed: URL('r4-root'), actual: 'git@example.com:other/r4-root.git' }]);

  root = auditProject('r4-empty');
  repo(join(root, 'local'));
  writeMarker(root, [['api', URL('api')], ['web', ''], ['local', '']], URL('r4-empty'));
  for (const k of R_KEYS) assert.deepEqual(auditRepos(root)[k], [], k);

  // git 은 돌렸는데 origin 이 없다: 빈 값이 목록 url 과 달라 R4
  root = auditProject('r4-no-origin');
  git(join(root, 'web'), 'remote', 'remove', 'origin');
  only(auditRepos(root), 'R4', [{ path: 'web', listed: URL('web'), actual: '' }]);
});

test('어긋남 판정: git 을 돌리지 못하면 R3·R4 를 건너뛰고, 상위 .git 이 파일(워크트리)이면 판정을 건너뛴다', async () => {
  const { auditRepos, GIT_TIMEOUT } = await marker();
  assert.equal(GIT_TIMEOUT, 5000);
  const root = auditProject('no-git-binary');
  git(join(root, 'web'), 'remote', 'set-url', 'origin', 'git@example.com:other/web.git');
  const path = process.env.PATH;
  process.env.PATH = join(root, '없는 폴더');
  let f;
  try { f = auditRepos(root); } finally { process.env.PATH = path; }
  for (const k of R_KEYS) assert.deepEqual(f[k], [], k);
  assert.equal(auditRepos(root).R4.length, 1);

  const main = auditProject('wt-main');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'base');
  const wt = join(dirname(main), 'wt');
  git(main, 'worktree', 'add', '-q', '--detach', wt);
  writeMarker(wt, [['api', URL('api')], ['gone', URL('gone')]], URL('wt-main'));
  const w = auditRepos(wt);
  assert.equal(w.worktree, true);
  for (const k of R_KEYS) assert.deepEqual(w[k], [], k);
  assert.deepEqual(w.repos.map((r) => r.path), ['api', 'gone']);
});

test('어긋남 판정: 표식 파일이 없거나 형식 밖 줄이면 error 에 종류와 줄 번호', async () => {
  const { auditRepos } = await marker();
  const root = auditProject('marker-error');
  assert.equal(auditRepos(root, '.agent/없음.yaml').error.kind, 'missing');
  writeFileSync(join(root, MARKER), 'repos:\n  - path: api\n  url: x\n');
  assert.deepEqual(auditRepos(root).error, { kind: 'unreadable', line: 3, text: '  url: x' });
});

// ── 자식 설정 세 갈래와 병합 ──────────────────────────────────────────────

test('자식 설정 세 갈래: child 는 그대로, auto 는 자동 설정 전체, override 는 git·tasks·wiki 를 안쪽 키 단위로 병합', async () => {
  const W = await ws();
  const { resolveChildConfig } = await workspace();
  const opts = { path: 'app', branch: 'main', sinceDays: 14, engineMajor: 2 };
  const app = resolveChildConfig(join(W, 'app'), opts);
  assert.equal(app.source, 'child');
  assert.deepEqual(app.config.adapters, ['tasks', 'wiki', 'git', 'note']);
  // 자식에 설정이 있으면 대체 설정은 쓰지 않는다
  assert.equal(resolveChildConfig(join(W, 'app'), { ...opts, override: { git: { areas: [] } } }).source, 'child');

  const svcOpts = { path: 'svc', branch: 'main', sinceDays: 21, engineMajor: 2 };
  const svc = resolveChildConfig(join(W, 'svc'), svcOpts);
  assert.equal(svc.source, 'auto');
  assert.deepEqual(svc.config, {
    engine: 2, project: { name: 'svc' }, adapters: ['git'],
    tasks: { dir: 'tasks', index: 'tasks/index.md' }, wiki: { index: '.agent/wiki/index.md' },
    git: { branch: 'main', sinceDays: 21, areas: [], runtimePaths: [] },
  });

  const o = resolveChildConfig(join(W, 'svc'), { ...svcOpts, override: { project: { name: '서비스' }, git: { areas: [['src/', '서버']] } } });
  assert.equal(o.source, 'override');
  assert.deepEqual(o.config.project, { name: '서비스' });
  assert.deepEqual(o.config.git, { branch: 'main', sinceDays: 21, areas: [['src/', '서버']], runtimePaths: [] });
  // 병합한 설정으로 자식을 빌드하면 git 어댑터가 ok 이고 커밋 영역이 대체 설정을 따른다
  const { buildGraph } = await import('../src/cli.mjs');
  const b = await buildGraph(join(W, 'svc'), { workspace: false, config: o.config });
  assert.deepEqual(b.data.adapters.map((a) => [a.name, a.status]), [['git', 'ok']]);
  assert.deepEqual(b.data.commits.map((c) => c.areas), [['기타', '서버']]);

  // 자동 설정의 어댑터: tasks/ 가 있으면 tasks, .agent/wiki/index.md 가 있으면 wiki
  mkdirSync(join(W, 'svc/tasks'), { recursive: true });
  mkdirSync(join(W, 'svc/.agent/wiki'), { recursive: true });
  writeFileSync(join(W, 'svc/.agent/wiki/index.md'), '# 위키\n');
  assert.deepEqual(resolveChildConfig(join(W, 'svc'), svcOpts).config.adapters, ['tasks', 'wiki', 'git']);
});

test('자식 설정의 engine major 가 다르면 자동 설정으로 대신 돌고 repos.child-engine-mismatch 경고', async () => {
  const W = await ws();
  editJson(join(W, 'app/map/config.json'), (c) => { c.engine = 1; });
  assert.equal(run(W, ['build']).code, 0);
  const d = data(W);
  const app = d.repos.find((r) => r.path === 'app');
  assert.deepEqual([app.build, app.config], ['ok', 'auto']);
  // 자동 설정도 app 의 tasks/ 를 읽는다
  assert.ok(d.tasks.some((t) => t.name === 'app:20260103-app-only'));
  const j = checkJson(W);
  assert.equal(j.code, 0);
  assert.deepEqual(reposCodes(j).map((p) => [p.code, p.level, p.subject]), [['repos.child-engine-mismatch', 'warn', { kind: 'repo', id: 'app' }]]);
});

// ── 워크스페이스 빌드 ─────────────────────────────────────────────────────

test('SC-1 상위 build 가 저장소 절을 낸다: 상위 + 자식 둘, 요약 줄 끝 「저장소 3 · 어긋남 0」', async () => {
  const W = await ws();
  const r = run(W, ['build']);
  assert.equal(r.code, 0, r.out + r.err);
  const last = r.out.trim().split('\n').at(-1);
  assert.match(last, /^map build → /);
  assert.ok(last.endsWith(' · 저장소 3 · 어긋남 0'), last);
  const d = data(W);
  assert.equal(d.repos.length, 3);
  assert.deepEqual(d.repos.map((x) => [x.path, x.build]), [['.', 'ok'], ['app', 'ok'], ['svc', 'ok']]);
  const [top, app, svc] = d.repos;
  assert.deepEqual([top.name, top.role, top.branch, top.commits], ['Workspace', null, 'main', 1]);
  assert.match(top.head, /^[0-9a-f]{7}$/);
  assert.deepEqual(top.tasks, { 진행: 1, 완료: 1 });
  assert.deepEqual([app.name, app.role, app.branch, app.config, app.board, app.commits], ['app', '앱 저장소', 'main', 'child', 'https://example.test/map/', 1]);
  assert.match(app.head, /^[0-9a-f]{7}$/);
  assert.deepEqual(app.engine, { installed: null, used: VERSION });
  assert.deepEqual(app.tasks, { 진행: 1, 완료: 1 });
  assert.equal(app.summary.errors, 0);
  assert.ok(app.summary.warnings >= 1, '자식 경고는 저장소 행의 수로만 온다');
  assert.deepEqual(app.drift, []);
  assert.deepEqual([svc.role, svc.config, svc.board, svc.commits, svc.tasks], ['서비스 저장소', 'auto', null, 1, {}]);
  assert.deepEqual(d.adapters.filter((a) => a.name.startsWith('repo:')).map((a) => [a.name, a.status]), [['repo:app', 'ok'], ['repo:svc', 'ok']]);
});

test('SC-2 합친 작업 수가 상위 단독·자식 단독 빌드의 합과 같다', async () => {
  const W = await ws();
  assert.equal(run(W, ['build']).code, 0);
  const solo = `${W}-solo`;
  made.push(solo);
  cpSync(W, solo, { recursive: true });
  editJson(join(solo, 'map/config.json'), (c) => { delete c.workspace; });
  assert.equal(run(solo, ['build']).code, 0);
  assert.equal(run(join(W, 'app'), ['build']).code, 0);
  const merged = data(W).tasks.length;
  const sum = data(solo).tasks.length + data(join(W, 'app')).tasks.length; // svc 는 tasks/ 가 없어 0
  assert.equal(merged, sum);
  assert.equal(merged, 4);
});

test('SC-3 같은 작업 폴더 이름이 저장소마다 다른 노드로 남고 넷만 접두를 달고 온다', async () => {
  const W = await ws();
  assert.equal(run(W, ['build']).code, 0);
  const d = data(W), gr = graph(W);
  const names = d.tasks.map((t) => t.name);
  assert.equal(names.length, new Set(names).size);
  assert.ok(names.includes('20260101-shared') && names.includes('app:20260101-shared'), names.join(','));
  const node = (kind, id) => gr.nodes.find((n) => n.kind === kind && n.id === id);
  assert.equal(node('task', 'app:20260101-shared').props.repo, 'app');
  assert.equal(node('task', 'app:20260101-shared').props.planFile, 'tasks/20260101-shared/plan.md', '경로 값은 자식 루트 기준 그대로');
  assert.equal(node('task', '20260101-shared').props.repo, undefined);
  // 번호 정의: 접두가 id 와 definers·definedAt[].task 에 같이 붙는다
  const dec = node('decision', 'app:DEC-1');
  assert.deepEqual(dec.props.definers, ['app:20260101-shared']);
  assert.deepEqual(dec.props.definedAt.map((x) => x.task), ['app:20260101-shared']);
  assert.deepEqual(node('decision', 'DEC-1').props.definers, ['20260101-shared']);
  assert.ok(gr.edges.some((e) => e.from === 'task:app:20260101-shared' && e.kind === 'defines' && e.to === 'decision:app:DEC-1'));
  assert.ok(!gr.edges.some((e) => e.from === 'task:20260101-shared' && e.to === 'decision:app:DEC-1'));
  // 위키 결정·장부·커밋
  assert.equal(node('decision', 'app:app-choice').props.file, '.agent/wiki/decisions/app-choice.md');
  assert.ok(node('ledger', 'app:running-0') && node('ledger', 'running-0'));
  const commits = gr.nodes.filter((n) => n.kind === 'commit').map((n) => n.id.replace(/[0-9a-f]{7}$/, '#')).sort();
  assert.deepEqual(commits, ['#', 'app:#', 'svc:#']);
  // 넷 밖의 종류(deploy 등)는 오지 않고, 자식 노드에 닿는 엣지는 defines 뿐이다
  const childNodes = gr.nodes.filter((n) => /^(app|svc):/.test(n.id));
  assert.deepEqual([...new Set(childNodes.map((n) => n.kind))].sort(), ['commit', 'decision', 'ledger', 'task']);
  assert.ok(childNodes.every((n) => n.props.repo === n.id.split(':')[0]));
  assert.equal(gr.nodes.filter((n) => n.kind === 'deploy').length, 1, '상위 deploy:head 하나');
  assert.deepEqual([...new Set(gr.edges.filter((e) => /:(app|svc):/.test(e.from) || /:(app|svc):/.test(e.to)).map((e) => e.kind))], ['defines']);
  // 자식 배지·이슈는 합치지 않는다
  assert.ok(!d.badges.some((b) => b.label === '앱 메모'));
  assert.ok(!d.issues.some((i) => i.label === '앱 메모'));
  assert.ok(!gr.issues.some((i) => i.label === '앱 메모'));
});

test('자식 폴더에 쓰지 않는다: 상위 build 전후 app·svc 파일 목록이 같다', async () => {
  const W = await ws();
  const before = { app: listFiles(join(W, 'app')), svc: listFiles(join(W, 'svc')) };
  assert.equal(run(W, ['build']).code, 0);
  assert.deepEqual({ app: listFiles(join(W, 'app')), svc: listFiles(join(W, 'svc')) }, before);
});

test('workspace 키가 없으면 지금처럼 한 루트 빌드다(repos 절·repo:* 상태 없음, 표식이 있어도 경고 없음)', async () => {
  const W = await ws();
  editJson(join(W, 'map/config.json'), (c) => { delete c.workspace; });
  const r = run(W, ['build']);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /저장소 \d/);
  const d = data(W);
  assert.equal(d.repos, undefined);
  assert.ok(!d.adapters.some((a) => a.name.startsWith('repo:')));
  assert.deepEqual(d.tasks.map((t) => t.name).sort(), ['20260101-shared', '20260102-parent-only']);
  assert.deepEqual(reposCodes(checkJson(W)), []);
});

test('표식 파일이 없으면 repos.marker-missing 오류로 상위만 빌드하고, 형식 밖 줄이면 repos.marker-unreadable 오류(줄 번호)', async () => {
  const W = await ws();
  rmSync(join(W, MARKER));
  assert.equal(run(W, ['build']).code, 0);
  assert.deepEqual(data(W).repos.map((x) => x.path), ['.']);
  assert.deepEqual(data(W).tasks.map((t) => t.name).sort(), ['20260101-shared', '20260102-parent-only']);
  let j = checkJson(W);
  assert.equal(j.code, 1);
  assert.deepEqual(reposCodes(j).map((p) => [p.code, p.level]), [['repos.marker-missing', 'error']]);

  writeFileSync(join(W, MARKER), 'repos:\n  - path: app\n  role: 밖\n');
  j = checkJson(W);
  assert.equal(j.code, 1);
  const p = reposCodes(j);
  assert.deepEqual(p.map((x) => [x.code, x.level]), [['repos.marker-unreadable', 'error']]);
  assert.deepEqual(p[0].anchors.map((a) => [a.file, a.line]), [[MARKER, 3]]);
});

test('SC-5 저장소 어긋남 R1~R4 가 check --json 의 repos.* 경고로 하나씩 나오고 종료 코드는 0(--strict 도)', async () => {
  const W = await ws();
  // R1: 목록에만 있는 gone, R4: svc 의 목록 url 과 실제 origin(없음)이 다르다
  writeFileSync(join(W, MARKER), ['repos:', '  - path: app', '    branch: main', '    role: 앱 저장소', '  - path: svc', '    url: https://example.test/svc.git', '    branch: main', '  - path: gone', '    role: 사라진 저장소', ''].join('\n'));
  // R2: 목록에 없는 저장소 폴더
  mkdirSync(join(W, 'extra'));
  git(join(W, 'extra'), 'init', '-q');
  // R3: 상위 색인에 든 자식 경로 파일
  git(W, 'update-index', '--add', '--cacheinfo', '100644,e69de29bb2d1d6434b8b29ae775ad8c2e48c5391,app/stray.txt');

  const j = checkJson(W);
  assert.equal(j.code, 0, j.err);
  assert.equal(j.errors, 0);
  assert.deepEqual(reposCodes(j).map((p) => [p.code, p.level, p.subject.id]), [
    ['repos.disk-only', 'warn', 'extra'],
    ['repos.listed-only', 'warn', 'gone'],
    ['repos.parent-index', 'warn', 'app'],
    ['repos.remote-mismatch', 'warn', 'svc'],
  ]);
  assert.ok(reposCodes(j).every((p) => p.subject.kind === 'repo'));
  const strict = checkJson(W, ['--strict']);
  assert.equal(strict.code, 0);
  assert.ok(reposCodes(strict).every((p) => p.level === 'warn'));

  const r = run(W, ['build']);
  assert.equal(r.code, 0);
  assert.match(r.out, / · 저장소 4 · 어긋남 4/);
  const d = data(W);
  const gone = d.repos.find((x) => x.path === 'gone');
  assert.equal(gone.build, 'missing');
  assert.deepEqual(gone.drift.map((x) => x.rule), ['R1']);
  assert.deepEqual(d.repos.find((x) => x.path === 'svc').drift.map((x) => x.rule), ['R4']);
  assert.deepEqual(d.repos.find((x) => x.path === 'app').drift.map((x) => x.rule), ['R3']);
  const st = d.adapters.find((a) => a.name === 'repo:gone');
  assert.equal(st.status, 'partial');
  assert.match(st.error, /폴더 없음/);
});

test('SC-6 자식 설정이 깨지거나 자식 빌드가 던져도 상위 build·check 는 멈추지 않는다', async () => {
  const W = await ws();
  writeFileSync(join(W, 'app/map/config.json'), '{ 깨진 설정');
  const b = run(W, ['build']);
  assert.equal(b.code, 0, b.out + b.err);
  let d = data(W);
  const st = d.adapters.find((a) => a.name === 'repo:app');
  assert.equal(st.status, 'partial');
  assert.ok(st.error);
  assert.equal(d.adapters.find((a) => a.name === 'repo:svc').status, 'ok');
  assert.equal(d.repos.find((x) => x.path === 'app').build, 'failed');
  assert.ok(!d.tasks.some((t) => t.name.startsWith('app:')));
  let j = checkJson(W);
  assert.equal(j.code, 0);
  assert.equal(j.errors, 0);
  assert.deepEqual(reposCodes(j).map((p) => [p.code, p.level, p.subject.id]), [['repos.child-build-failed', 'warn', 'app']]);
  assert.ok(!j.problems.some((p) => p.code === 'adapter.failed'));

  // 설정은 읽히는데 빌드가 던진다(adapters 가 배열이 아님)
  writeFileSync(join(W, 'app/map/config.json'), JSON.stringify({ engine: 2, adapters: 5 }));
  assert.equal(run(W, ['build']).code, 0);
  d = data(W);
  assert.equal(d.repos.find((x) => x.path === 'app').build, 'failed');
  j = checkJson(W);
  assert.equal(j.code, 0);
  assert.deepEqual(reposCodes(j).map((p) => p.code), ['repos.child-build-failed']);
});

test('SC-7 워크트리 상위에서는 repos.* 가 없고 repo:* 는 partial 「워크트리라 자식 저장소 없음」', async () => {
  const W = await ws();
  const wt = `${W}-wt`;
  made.push(wt);
  git(W, 'worktree', 'add', '-q', '--detach', wt);
  const j = checkJson(wt);
  assert.equal(j.code, 0, j.err);
  assert.deepEqual(reposCodes(j), []);
  assert.ok(!j.problems.some((p) => p.code === 'adapter.failed'));
  assert.equal(run(wt, ['build']).code, 0);
  const d = data(wt);
  assert.deepEqual(d.adapters.filter((a) => a.name.startsWith('repo:')).map((a) => [a.name, a.status, a.error]), [
    ['repo:app', 'partial', '워크트리라 자식 저장소 없음'],
    ['repo:svc', 'partial', '워크트리라 자식 저장소 없음'],
  ]);
  assert.deepEqual(d.repos.map((x) => [x.path, x.build]), [['.', 'ok'], ['app', 'skipped'], ['svc', 'skipped']]);
});

test('SC-11 check --staged 와 affected 는 자식을 빌드하지 않는다(일반 check 는 빌드한다)', async () => {
  const W = await ws();
  const log = join(tmp('자식 빌드 기록'), 'builds.log');
  const env = { ...process.env, WS_FIXTURE_LOG: log };
  const builds = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
  writeFileSync(join(W, 'tasks/20260102-parent-only/plan.md'), '# 상위에만 있는 작업\n\n- [ ] PN-01 상위 정리 항목\n- [ ] PN-02 더한 항목\n');
  git(W, 'add', 'tasks/20260102-parent-only/plan.md');
  const staged = run(W, ['check', '--staged', '--json'], env);
  assert.equal(staged.code, 0, staged.out + staged.err);
  assert.equal(JSON.parse(staged.out).errors, 0);
  assert.deepEqual(builds(), []);
  const aff = run(W, ['affected'], env);
  assert.equal(aff.code, 0, aff.err);
  assert.deepEqual(builds(), []);
  const { buildGraph } = await import('../src/cli.mjs');
  const solo = await buildGraph(W, { workspace: false });
  assert.equal(solo.data.repos, undefined);
  assert.deepEqual(builds(), []);
  // 대조: 일반 check 는 app 을 한 번 빌드한다
  assert.equal(run(W, ['check', '--json'], env).code, 0);
  assert.deepEqual(builds(), [realpathSync(join(W, 'app'))]);
});

// ── 이슈 코드 표 ───────────────────────────────────────────────────────────

test('repos.* 여덟 코드가 코드 표와 docs/issue-codes.md 에 같은 집합으로 있고, 처리 값은 계약 값뿐이며 --strict 로 오르지 않는다', async () => {
  const { ISSUE_CODES, RESOLUTIONS, applyStrict } = await import('../src/lib/issues.mjs');
  const want = {
    'repos.listed-only': ['warn', ['source']],
    'repos.disk-only': ['warn', ['source']],
    'repos.parent-index': ['warn', ['source']],
    'repos.remote-mismatch': ['warn', ['source', 'config']],
    'repos.marker-missing': ['error', ['config', 'source']],
    'repos.marker-unreadable': ['error', ['config', 'source']],
    'repos.child-build-failed': ['warn', ['config']],
    'repos.child-engine-mismatch': ['warn', ['config']],
  };
  const table = Object.fromEntries(Object.entries(ISSUE_CODES).filter(([c]) => c.startsWith('repos.')).map(([c, v]) => [c, [v.level, v.resolutions]]));
  assert.deepEqual(table, want);
  for (const [, [, res]] of Object.entries(table)) assert.ok(res.every((r) => RESOLUTIONS.includes(r)));
  const doc = readFileSync(join(PKG, 'docs/issue-codes.md'), 'utf8');
  assert.deepEqual([...new Set(doc.match(/`repos\.[a-z-]+`/g) || [])].map((s) => s.slice(1, -1)).sort(), Object.keys(want).sort());
  assert.doesNotMatch(doc, /project:repos|wiki:repos/);
  const warn = { level: 'warn', code: 'repos.listed-only', msg: 'x', subject: null, anchors: [], resolutions: ['source'] };
  assert.equal(applyStrict([warn], true)[0].level, 'warn');
});
