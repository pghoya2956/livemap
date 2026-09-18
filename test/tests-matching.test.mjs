// 검사↔화면 매칭 검사: 작은따옴표 주소, 백틱 템플릿, 헬퍼 파일이 돌려주는 경로, Playwright 단계 태그.
// 임시 폴더에 작은 프로젝트를 써서 build한다(git 없음). 태그는 여정 파일의 단계 → 화면으로 푼다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildGraph } from '../src/cli.mjs';

const put = (root, file, text) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };

const APP = `import { Resorts } from './pages/Resorts';
export function App() {
  return (
    <Routes>
      <Route path="/resorts" element={<Resorts />} />
      <Route path="/r/:resort" element={<Resort />} />
      <Route path="/me/teams/:id/request" element={<TeamRequest />} />
      <Route path="/ops/:resort/inbox" element={<OpsInbox />} />
    </Routes>
  );
}`;

const SEMANTIC = {
  project: { name: 'T' },
  actors: { diver: '다이버' },
  statusLegend: { live: '동작', mock: '목업', planned: '미착수', next: '다음' },
  journeys: [{
    id: 'discover', title: '찾기', actor: 'diver', lane: 'L',
    steps: [
      { id: 'list', label: '목록', intent: '리조트를 고른다', status: 'live', screens: ['/resorts'] },
      { id: 'detail', label: '상세', intent: '상품을 본다', status: 'live', screens: ['/r/:resort'] },
      { id: 'inbox', label: '접수함', intent: '요청을 본다', status: 'live', screens: ['/ops/:resort/inbox'] },
    ],
  }],
};

function project() {
  const root = mkdtempSync(join(tmpdir(), 'livemap-tests-'));
  put(root, 'web/src/App.tsx', APP);
  put(root, 'web/src/pages/Resorts.tsx', 'export function Resorts() { return <div/>; }');
  put(root, 'map/semantic/journeys.json', JSON.stringify(SEMANTIC));
  put(root, 'map/config.json', JSON.stringify({
    engine: 1,
    project: { name: 'T' },
    adapters: ['router', 'tests'],
    router: { app: 'web/src/App.tsx', pagesDir: 'web/src/pages', localDirs: ['web/src/pages'] },
    tests: { dir: 'tests', gatePattern: 'ALLOW_FRESH' },
    semantic: 'map/semantic/journeys.json',
    floors: { screen: 1, test: 1 },
  }));
  // 작은따옴표 주소 하나만 옛 규칙으로도 잡힌다
  put(root, 'tests/plain.spec.mjs', `import { test } from '@playwright/test';
test('목록이 뜬다', async ({ page }) => { await page.goto('/resorts'); });`);
  // 백틱 템플릿 주소
  put(root, 'tests/template.spec.mjs', `import { test } from '@playwright/test';
const slug = 'R-A';
test('리조트 상세', async ({ page }) => { await page.goto(\`/r/\${slug}\`); });`);
  // 헬퍼 파일이 돌려주는 경로(진입 헬퍼 이동)
  put(root, 'tests/helpers/screen.mjs', `export const teamRequestPath = (id) => \`/me/teams/\${id}/request\`;
export async function openScreen(page, path) { await page.goto(path); }`);
  put(root, 'tests/helper-move.spec.mjs', `import { test } from '@playwright/test';
import { openScreen, teamRequestPath } from './helpers/screen.mjs';
test('요청 화면', async ({ page }) => { await openScreen(page, teamRequestPath('T-1')); });`);
  // 주소가 변수라 글자로는 모르고 단계 태그로만 잇는 검사
  put(root, 'tests/tagged.spec.mjs', `import { test } from '@playwright/test';
test('접수함', { tag: ['@discover/inbox'] }, async ({ page }) => { await page.goto(process.env.OPS_URL); });`);
  return root;
}

const covered = (g, file) => g.edges
  .filter((e) => e.from === `test:${file}` && e.kind === 'covers' && e.to.startsWith('screen:'))
  .map((e) => e.to.replace('screen:', '')).sort();

test('작은따옴표·백틱 템플릿·헬퍼 경로·단계 태그가 모두 화면에 이어진다', async () => {
  const root = project();
  try {
    const { g } = await buildGraph(root);
    assert.deepEqual(covered(g, 'tests/plain.spec.mjs'), ['/resorts']);
    assert.deepEqual(covered(g, 'tests/template.spec.mjs'), ['/r/:resort']);
    assert.deepEqual(covered(g, 'tests/helper-move.spec.mjs'), ['/me/teams/:id/request']);
    assert.deepEqual(covered(g, 'tests/tagged.spec.mjs'), ['/ops/:resort/inbox']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('단계 태그를 검사 노드에 싣고 없는 단계 태그는 경고다', async () => {
  const root = project();
  try {
    put(root, 'tests/tagged.spec.mjs', `import { test } from '@playwright/test';
test('접수함', { tag: ['@discover/inbox', '@discover/없는단계'] }, async ({ page }) => {});`);
    const { g } = await buildGraph(root);
    const node = g.get('test', 'tests/tagged.spec.mjs');
    assert.deepEqual(node.props.tags, ['discover/inbox', 'discover/없는단계']);
    const issue = g.issues.find((i) => i.code === 'tests.tag-unknown');
    assert.ok(issue, '없는 단계 태그는 tests.tag-unknown 경고');
    assert.match(issue.message, /discover\/없는단계/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
