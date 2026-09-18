// affected 명령 검사: 바뀐 파일 → 화면 → 그 화면을 지나는 브라우저 검사.
// 임시 git 저장소에 작은 프로젝트를 만들어 커밋하고 파일을 바꿔 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { affected } from '../src/affected.mjs';

const put = (root, file, text) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'livemap-affected-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });
  put(root, 'web/src/App.tsx', `import { Items } from './pages/Items';
import { Account } from './pages/Account';
export function App() {
  return (
    <Routes>
      <Route path="/items" element={<Items />} />
      <Route path="/account" element={<Account />} />
    </Routes>
  );
}`);
  put(root, 'web/src/pages/Items.tsx', 'export function Items() { return <div/>; }');
  put(root, 'web/src/pages/Account.tsx', 'export function Account() { return <div/>; }');
  put(root, 'app/server.mjs', "route('GET', '/api/items');");
  put(root, 'tests/items.spec.mjs', `import { test } from '@playwright/test';
test('목록', async ({ page }) => { await page.goto('/items'); });`);
  put(root, 'tests/account.spec.mjs', `import { test } from '@playwright/test';
test('계정', async ({ page }) => { await page.goto('/account'); });`);
  put(root, 'tests/unit.test.mjs', "import test from 'node:test';\ntest('단위', () => {});");
  put(root, 'tasks/index.md', '# 작업\n\n## 현재 실행 장부\n');
  put(root, 'map/config.json', JSON.stringify({
    engine: 1,
    project: { name: 'T' },
    adapters: ['router', 'bff', 'tests'],
    router: { app: 'web/src/App.tsx', pagesDir: 'web/src/pages', localDirs: ['web/src/pages'] },
    bff: { server: 'app/server.mjs' },
    tests: { dir: 'tests', gatePattern: 'ALLOW_FRESH' },
    tasks: { dir: 'tasks', index: 'tasks/index.md' },
    floors: { screen: 1, test: 1 },
  }));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 'T');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { root, git };
}



test('화면 파일만 바뀌면 그 화면을 지나는 브라우저 검사만 고른다', async () => {
  const { root } = repo();
  try {
    put(root, 'web/src/pages/Items.tsx', 'export function Items() { return <div>바뀜</div>; }');
    const r = await affected({ root });
    assert.equal(r.all, false);
    assert.deepEqual(r.specs, ['tests/items.spec.mjs']);
    assert.match(r.command, /^npx --no playwright test tests\/items\.spec\.mjs$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('화면 밖 파일이 섞이면 전체 실행이다', async () => {
  const { root } = repo();
  try {
    put(root, 'app/server.mjs', "route('GET', '/api/items'); // 바뀜");
    const r = await affected({ root });
    assert.equal(r.all, true);
    assert.match(r.reason, /app\/server\.mjs/);
    assert.match(r.command, /playwright test$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('문서만 바뀌면 고를 검사가 없다', async () => {
  const { root } = repo();
  try {
    put(root, 'tasks/index.md', '# 작업\n\n## 현재 실행 장부\n\n바뀐 줄\n');
    const r = await affected({ root });
    assert.equal(r.all, false);
    assert.deepEqual(r.specs, []);
    assert.equal(r.command, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('브라우저 검사 파일이 바뀌면 그 파일을 고르고 node 검사는 고르지 않는다', async () => {
  const { root } = repo();
  try {
    put(root, 'tests/account.spec.mjs', `import { test } from '@playwright/test';
test('계정', async ({ page }) => { await page.goto('/account'); }); // 바뀜`);
    put(root, 'tests/unit.test.mjs', "import test from 'node:test';\ntest('단위', () => {}); // 바뀜");
    const r = await affected({ root });
    assert.deepEqual(r.specs, ['tests/account.spec.mjs']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--base는 그 커밋부터 지금까지 바뀐 파일을 본다', async () => {
  const { root, git } = repo();
  try {
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
    put(root, 'web/src/pages/Account.tsx', 'export function Account() { return <div>둘</div>; }');
    git('add', '-A');
    git('commit', '-q', '-m', '화면 변경');
    const r = await affected({ root, base });
    assert.deepEqual(r.specs, ['tests/account.spec.mjs']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
