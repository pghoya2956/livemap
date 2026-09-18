// 작은 수정 검사: 매니페스트만 바꾼 배포 봇 커밋, 반복 등록 검사의 템플릿 제목, 큰따옴표 import, semantic 키 없는 설정.
// 고정 저장소 대신 임시 폴더(필요하면 임시 git 저장소)를 만들어 어댑터를 직접 돌린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Graph, runAdapter } from '../src/lib/graph.mjs';
import { makeFs } from '../src/lib/util.mjs';
import { readingOf } from '../src/lib/reading.mjs';
import { buildGraph } from '../src/cli.mjs';
import { check } from '../src/check.mjs';
import deploy from '../src/adapters/deploy.mjs';
import tests from '../src/adapters/tests.mjs';
import router from '../src/adapters/router.mjs';

const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'livemap-small-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const put = (root, file, text) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };
const run = (fn, root, cfg) => { const g = new Graph(); runAdapter(g, 'x', (g) => fn(g, makeFs(root), cfg)); return g; };

// 배포 어댑터 --------------------------------------------------------------
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: GIT_ENV }).trim();
const commit = (root, msg) => { git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', msg); return git(root, 'rev-parse', 'HEAD'); };
const MANIFEST = 'deploy/app.yaml';
const manifest = (sha) => `spec:\n  image: registry.local/app:${sha}\n`;
const DEPLOY_CFG = { project: { host: 'https://app.local' }, git: { branch: 'main', runtimePaths: ['src'] }, deploy: { manifest: MANIFEST, imagePattern: 'image: registry\\.local/[^:]+:([0-9a-f]{40})' } };
const deployNode = (root) => {
  const saved = process.env.MAP_ASSUME_DEPLOYED_SHA;
  delete process.env.MAP_ASSUME_DEPLOYED_SHA;
  try { const g = run(deploy, root, DEPLOY_CFG); return { node: g.get('deploy', 'homelab'), report: g.adapters[0] }; }
  finally { if (saved !== undefined) process.env.MAP_ASSUME_DEPLOYED_SHA = saved; }
};

test('SC-9 deploy: 매니페스트만 바꾼 봇 커밋은 behind에서 빠지고 behindManifestOnly로 센다', (t) => {
  const root = tmp(t);
  git(root, 'init', '-q', '-b', 'main');
  put(root, 'src/app.mjs', 'export const v = 1;\n');
  put(root, MANIFEST, manifest('0'.repeat(40)));
  const base = commit(root, '기능');
  // 배포 뒤 봇이 매니페스트만 바꾼다: HEAD가 그 커밋이어도 뒤처짐은 0
  put(root, MANIFEST, manifest(base));
  commit(root, 'deploy: 태그 [skip ci]');
  let { node } = deployNode(root);
  assert.equal(node.props.behind, 0);
  assert.equal(node.props.behindManifestOnly, 1);
  assert.equal(node.props.behindRuntime, 0);
  assert.equal(readingOf(node, 'behind'), 'rule');
  // 봇 커밋이 두 번 쌓여도 0
  put(root, MANIFEST, manifest(base) + '# 재배포\n');
  commit(root, 'deploy: 재배포 [skip ci]');
  ({ node } = deployNode(root));
  assert.equal(node.props.behind, 0);
  assert.equal(node.props.behindManifestOnly, 2);
});

test('SC-9 deploy: 매니페스트와 다른 파일을 함께 바꾼 커밋은 behind에 든다', (t) => {
  const root = tmp(t);
  git(root, 'init', '-q', '-b', 'main');
  put(root, 'src/app.mjs', 'export const v = 1;\n');
  put(root, MANIFEST, manifest('0'.repeat(40)));
  const base = commit(root, '기능');
  put(root, MANIFEST, manifest(base));
  commit(root, 'deploy: 태그 [skip ci]');
  put(root, MANIFEST, manifest(base) + '# 설정\n');
  put(root, 'src/app.mjs', 'export const v = 2;\n');
  commit(root, '기능과 매니페스트 함께');
  put(root, 'README.md', '문서\n');
  commit(root, '문서');
  const { node } = deployNode(root);
  assert.equal(node.props.behind, 2);
  assert.equal(node.props.behindManifestOnly, 1);
  assert.equal(node.props.behindRuntime, 1);
  assert.equal(readingOf(node, 'behind'), 'rule');
});

test('SC-9 deploy: 매니페스트 sha가 이력에 없으면 behind null, 읽기 상태 unknown', (t) => {
  const root = tmp(t);
  git(root, 'init', '-q', '-b', 'main');
  put(root, MANIFEST, manifest('a'.repeat(40)));
  commit(root, '처음');
  const { node, report } = deployNode(root);
  assert.equal(node.props.behind, null);
  assert.equal(node.props.behindManifestOnly, null);
  assert.equal(readingOf(node, 'behind'), 'unknown');
  assert.equal(report.status, 'partial');
});

// 검사 어댑터 --------------------------------------------------------------
test('SC-10 tests: 제목이 ${ 를 가진 템플릿 문자열인 호출이 있으면 count 읽기 상태 partial', (t) => {
  const root = tmp(t);
  put(root, 'tests/role-loop.spec.mjs', "import { test } from '@playwright/test';\nfor (const role of ['a', 'b', 'c']) {\n  test(`${role} 역할 도달`, async () => {});\n}\n");
  put(root, 'tests/plain.spec.mjs', "import { test } from '@playwright/test';\ntest('단순', async () => {});\ntest(`고정 제목`, async () => {});\n");
  const g = run(tests, root, { tests: { dir: 'tests', gatePattern: 'NEVER_MATCH' } });
  const loop = g.get('test', 'tests/role-loop.spec.mjs');
  assert.equal(loop.props.count, 1);
  assert.equal(readingOf(loop, 'count'), 'partial');
  assert.match(loop.props.readingNotes.count, /템플릿/);
  const plain = g.get('test', 'tests/plain.spec.mjs');
  assert.equal(plain.props.count, 2);
  assert.equal(readingOf(plain, 'count'), 'rule');
});

// 화면 어댑터 --------------------------------------------------------------
test('router: 큰따옴표 import도 로컬 닫힘으로 따라가 출처를 분류한다', (t) => {
  const root = tmp(t);
  put(root, 'web/src/App.tsx', '<Routes>\n  <Route path="/dq" element={<DqPage />} />\n  <Route path="/sq" element={<SqPage />} />\n</Routes>\n');
  put(root, 'web/src/pages/DqPage.tsx', 'import { Panel } from "../components/Panel";\nexport function DqPage() { return Panel(); }\n');
  put(root, 'web/src/pages/SqPage.tsx', "import { Panel } from '../components/Panel';\nexport function SqPage() { return Panel(); }\n");
  put(root, 'web/src/components/Panel.tsx', "import { load } from '../lib/queries';\nexport function Panel() { return load(); }\n");
  const cfg = { router: { app: 'web/src/App.tsx', pagesDir: 'web/src/pages', localDirs: ['web/src/pages', 'web/src/components'], mockPattern: "/mock'", livePattern: 'lib/queries' } };
  const g = run(router, root, cfg);
  assert.equal(g.get('screen', '/sq').props.source, 'live');
  assert.equal(g.get('screen', '/dq').props.source, 'live');
  assert.deepEqual(g.get('screen', '/dq').props.files, ['web/src/pages/DqPage.tsx', 'web/src/components/Panel.tsx']);
});

// 설정 ---------------------------------------------------------------------
test('config: semantic 키가 없으면 여정 입력이 없는 것으로 보고 build·check가 멈추지 않는다', async (t) => {
  const root = tmp(t);
  put(root, 'map/config.json', JSON.stringify({ engine: 2, adapters: [], project: { name: 'Empty' } }));
  const r = await buildGraph(root);
  assert.deepEqual(r.data.semantic.journeys, []);
  assert.equal('semantic' in JSON.parse(JSON.stringify(r.data.sources)), false);
  assert.ok(Array.isArray(check(r.data, r.cfg)));
});
