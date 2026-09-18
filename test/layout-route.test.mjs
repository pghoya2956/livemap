// 레이아웃 라우트 검사: <Route>가 자식을 감싸면 그 셸 컴포넌트의 /api/ 리터럴이 자식 화면에 합쳐지는지 본다.
// 셸은 자식 화면마다 함께 그려지므로 셸에서 부르는 API는 그 화면에서 실제로 일어난다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINI = join(HERE, 'fixtures', 'mini');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// mini를 복사해 셸 컴포넌트와 레이아웃 라우트를 더한다. mini 자체는 골든 검사가 바이트로 보므로 건드리지 않는다
function withLayout() {
  const dir = mkdtempSync(join(tmpdir(), 'livemap 레이아웃 검사-'));
  made.push(dir);
  cpSync(MINI, dir, { recursive: true });
  mkdirSync(join(dir, 'web/src/components'), { recursive: true });
  writeFileSync(join(dir, 'web/src/components/Shell.tsx'),
    "export function Shell() {\n"
    + "  const out = () => fetch('/api/logout', { method: 'POST' });\n"
    + "  return <button onClick={out}>나가기</button>;\n"
    + "}\n");
  writeFileSync(join(dir, 'web/src/App.tsx'),
    "import { Live } from './pages/Live';\n"
    + "import { Mocked } from './pages/Mocked';\n"
    + "import { Shell } from './components/Shell';\n"
    + "export function App() {\n"
    + "  return (\n"
    + "    <Routes>\n"
    + "      <Route path=\"/app\" element={<Shell />}>\n"
    + "        <Route path=\"live\" element={<Live />} />\n"
    + "        <Route path=\"mocked\" element={adminGuard(<Mocked />)} />\n"
    + "      </Route>\n"
    + "      <Route path=\"*\" element={<p>none</p>} />\n"
    + "    </Routes>\n"
    + "  );\n"
    + "}\n");
  return dir;
}

const paths = (screen) => (screen.props.apiLiterals || []).map((l) => l.path);

test('레이아웃 라우트: 셸의 /api/ 리터럴이 자식 화면마다 합쳐진다', async () => {
  const { g } = await buildGraph(withLayout());
  const screens = g.of('screen');
  assert.deepEqual(screens.map((s) => s.id).sort(), ['/app/live', '/app/mocked'], '자식 화면 둘이 선다');
  for (const s of screens) {
    assert.ok(paths(s).includes('/api/logout'), `${s.id}에 셸의 /api/logout이 붙어야 한다`);
  }
});

test('레이아웃 라우트: 셸 리터럴이 자기 화면 것을 지우지 않고 중복도 만들지 않는다', async () => {
  const { g } = await buildGraph(withLayout());
  const live = g.of('screen').find((s) => s.id === '/app/live');
  // mini의 Live는 리터럴이 아니라 hook(Resorts)으로 API를 부른다. 셸을 합쳐도 그 hook이 남아야 한다
  assert.deepEqual(live.props.hookApiKeys, ['Resorts'], '자기 화면 hook이 남아야 한다');
  assert.equal(new Set(paths(live)).size, paths(live).length, '같은 리터럴이 두 번 들어가지 않는다');
});

test('레이아웃 라우트: 셸 자신은 화면 노드가 되지 않는다', async () => {
  const { g } = await buildGraph(withLayout());
  assert.equal(g.of('screen').find((s) => s.id === '/app'), undefined, '레이아웃 경로는 사람이 갈 화면이 아니다');
});
