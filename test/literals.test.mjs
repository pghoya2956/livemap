// 화면→API 리터럴 규칙 검사: 리터럴 추출·정규화·대응, 리터럴 추출 닫힘(파일·심볼), 모든 어댑터 뒤 연결 단계,
// hookApi 합집합과 두 정리 경고, router.unknown-api, 관측 호출만 세는 고아 API와 journey.api-not-observed.
// 고정 저장소 대신 임시 폴더에 작은 프로젝트를 써서 build한다(git 없음: 마지막 커밋은 null).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildGraph } from '../src/cli.mjs';
import { checkProblems } from '../src/check.mjs';
import { textLines } from '../src/lib/issues.mjs';
import { readingOf } from '../src/lib/reading.mjs';

const put = (root, file, text) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };
const lib = () => import('../src/lib/literals.mjs');

const APP = `import { Items } from './pages/Items';
export function App() {
  return (
    <Routes>
      <Route path="/items" element={<Items />} />
      <Route path="/items/:id" element={<ItemDetail />} />
      <Route path="/account" element={<Account />} />
    </Routes>
  );
}
`;
const FILES = {
  'web/src/App.tsx': APP,
  'web/src/pages/Items.tsx': `import { useItems, useCard } from '../lib/client';
import type { Hidden } from '../lib/typesonly';
import { get } from '../lib/request';
import { Badge } from '../components';
export function Items() {
  const ping = () => get('/api/missing');
  return <Badge>{useItems().length}{useCard('a')}</Badge>;
}
`,
  'web/src/pages/ItemDetail.tsx': `import * as client from "../lib/client";
import { request } from '../lib/request';
export function ItemDetail({ id, store, query }) {
  const q = client.useItem(id);
  // 따옴표 없는 주석 경로 /api/comment-only 는 잡히지 않는다
  const save = () => request(\`/api/items/\${encodeURIComponent(id)}/save?draft=1\`, {});
  const list = () => request(\`/api/stores/\${store}/orders\${query}\`);
  return q;
}
`,
  'web/src/pages/Account.tsx': `import { useProfile, useOrders, useSecret } from '../lib/client';
export function Account() {
  return [useProfile(), useOrders(), useSecret()];
}
`,
  'web/src/components/index.ts': `export { Badge } from './Badge';
`,
  'web/src/components/Badge.tsx': `import { useBadge } from '../lib/extra';
export function Badge({ children }) { useBadge(); return children; }
`,
  'web/src/lib/extra.ts': `import { get } from './request';
export function useBadge() {
  return get("/api/badges");
}
`,
  'web/src/lib/request.ts': `export function get(path) { return path; }
export function request(path, body) { return [path, body]; }
`,
  'web/src/lib/typesonly.ts': `export type Hidden = { path: '/api/hidden' };
`,
  'web/src/lib/secret.ts': `export const secretPath = '/api/secret';
`,
  'web/src/lib/profile.ts': `import { get } from './request';
export function useProfile() {
  return get('/api/profile');
}
`,
  'web/src/lib/client.ts': `import { get, request } from './request';
import { secretPath } from './secret';
import type { Item } from './typesonly';
export { useProfile } from './profile';

export function useItems() {
  return get('/api/items');
}
// 목록 응답 하나를 공유한다
export function useCard(id) {
  return useItems().find((x) => x.id === id);
}
function fresh(path) {
  return { run: () => get(path) };
}
export function itemOptions(id) {
  return fresh(\`/api/items/\${id}\`);
}
export function useItem(id) {
  return itemOptions(id);
}
export function useOrders() {
  return fresh('/api/orders');
}
export function useSecret() {
  return get(secretPath);
}
export function useUnused() {
  return get("/api/unused");
}
export const useRemove = (id) => request(\`/api/items/\${id}/remove\`, {});
export const NOTE = "/mock' /content/";
`,
  'app/server.mjs': `const routes = [
  route('GET', '/api/items', async () => {}),
  route('POST', '/api/items', async () => {}),
  route('GET', '/api/items/:id', async () => {}),
  route('POST', '/api/items/:id/save', async () => {}),
  route('POST', '/api/items/:id/remove', async () => {}),
  route('GET', '/api/stores/:store/orders', async () => {}),
  route('GET', '/api/stores/:store/orders/:id', async () => {}),
  route('GET', '/api/profile', async () => {}),
  route('GET', '/api/orders', async () => {}),
  route('GET', '/api/badges', async () => {}),
  route('GET', '/api/unused', async () => {}),
];
`,
  'map/semantic/journeys.json': JSON.stringify({ project: { name: 'Shop' }, actors: {}, journeys: [
    { id: 'j1', title: '물건 보기', steps: [{ id: 's1', label: '목록', status: 'live', screens: ['/items'], apis: ['/api/items', '/api/items/:id/remove'] }] },
  ] }),
};
const CFG = {
  engine: 1,
  adapters: ['router', 'bff'],
  project: { name: 'Shop' },
  router: { app: 'web/src/App.tsx', pagesDir: 'web/src/pages', localDirs: ['web/src/pages', 'web/src/components'], mockPattern: "/mock'", fixedPattern: '/content/', livePattern: 'lib/' },
  bff: { server: 'app/server.mjs' },
  semantic: 'map/semantic/journeys.json',
};

async function project(t, { cfg = CFG, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'livemap-literals-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [f, text] of Object.entries({ ...FILES, ...files })) put(root, f, text);
  put(root, 'map/config.json', JSON.stringify(cfg, null, 2));
  return { root, ...(await buildGraph(root)) };
}
const callsOf = (g, path) => g.out('screen', path, 'calls').map((a) => a.id).sort();
const literalsOf = (g, path) => g.get('screen', path).props.apiLiterals.map((l) => `${l.path}${l.open ? '…' : ''} ${l.file}:${l.line}`).sort();
const codes = (data, code) => checkProblems(data, { floors: {} }).filter((p) => p.code === code);

test('SC-4 리터럴 추출: 작은·큰따옴표·백틱, 조각 전체 ${}는 :param, 조각 중간 ${}는 열린 끝, 쿼리 문자열, 주석 속 따옴표 없는 경로', async () => {
  const { extractApiLiterals, normalizeApiLiteral } = await lib();
  const text = [
    "get('/api/a');",
    'get("/api/b?x=1");',
    '// 주석 경로 /api/c 는 따옴표가 없다',
    'get(`/api/teams/${encodeURIComponent(id)}/leave`);',
    'get(`/api/ops/${resort}/bookings${query}`, `/api/list?status=${s}`);',
    "get('/apix/no'); get('api/no');",
  ].join('\n');
  assert.deepEqual(extractApiLiterals(text), [
    { path: '/api/a', line: 1 },
    { path: '/api/b', line: 2 },
    { path: '/api/teams/:param/leave', line: 4 },
    { path: '/api/ops/:param/bookings', open: true, line: 5 },
    { path: '/api/list', line: 5 },
  ]);
  assert.deepEqual(normalizeApiLiteral('/api/x-${a}/y'), { path: '/api/x-', open: true });
  assert.deepEqual(normalizeApiLiteral('/api/x/${a}.json'), { path: '/api/x/', open: true });
  assert.deepEqual(normalizeApiLiteral('/api/x/${a ? "?" : ""}/y'), { path: '/api/x/:param/y' });
  // 시작 줄 번호를 주면 그 줄부터 센다(부분 모듈 선언 범위)
  assert.deepEqual(extractApiLiterals("\nx('/api/z')", 10), [{ path: '/api/z', line: 11 }]);
});

test('SC-4 대응: 조각 수가 같고 각 조각이 같거나 한쪽이 :이름, 열린 끝은 앞부분, 메서드 접두어는 떼고 본다', async () => {
  const { matchesApi, apiPathOf } = await lib();
  assert.equal(apiPathOf('POST /api/teams'), '/api/teams');
  assert.equal(apiPathOf('/api/teams'), '/api/teams');
  const m = (path, api, open) => matchesApi(open ? { path, open } : { path }, api);
  assert.equal(m('/api/teams/:param', '/api/teams/:id'), true);
  assert.equal(m('/api/teams/abc', '/api/teams/:id'), true);
  assert.equal(m('/api/teams/:param/leave', 'POST /api/teams/:id/leave'), true);
  assert.equal(m('/api/teams', '/api/teams/:id'), false);
  assert.equal(m('/api/teams/:param', '/api/teams'), false);
  assert.equal(m('/api/team', '/api/teams'), false);
  assert.equal(m('/api/ops/:param/bookings', '/api/ops/:resort/bookings', true), true);
  assert.equal(m('/api/ops/:param/bookings', '/api/ops/:resort/bookings/:id/confirm', true), true);
  assert.equal(m('/api/ops/:param/bookings', '/api/ops/:resort', true), false);
  assert.equal(m('/api/x-', '/api/x-ray', true), true);
  assert.equal(m('/api/x/', '/api/x', true), false);
  assert.equal(m('/api/x/', '/api/x/:id', true), true);
});

test('SC-4 리터럴 추출 닫힘: 훅 본문, 보조 함수 2단계, 인자로 넘긴 리터럴, 네임스페이스 import, 재수출은 잡고 import type·부분 모듈의 import·가져오지 않은 선언은 뺀다', async (t) => {
  const { g } = await project(t);
  assert.deepEqual(literalsOf(g, '/items'), [
    '/api/badges web/src/lib/extra.ts:3',
    '/api/items web/src/lib/client.ts:7',
    '/api/missing web/src/pages/Items.tsx:6',
  ]);
  assert.deepEqual(literalsOf(g, '/items/:id'), [
    '/api/items/:param web/src/lib/client.ts:17',
    '/api/items/:param/save web/src/pages/ItemDetail.tsx:6',
    '/api/stores/:param/orders… web/src/pages/ItemDetail.tsx:7',
  ]);
  assert.deepEqual(literalsOf(g, '/account'), [
    '/api/orders web/src/lib/client.ts:23',
    '/api/profile web/src/lib/profile.ts:3',
  ]);
  const all = JSON.stringify(g.of('screen').map((s) => s.props.apiLiterals));
  for (const p of ['/api/hidden', '/api/secret', '/api/unused', '/api/comment-only', '/remove']) assert.equal(all.includes(p), false, p);
});

test('SC-4 연결 단계: router 뒤에 도는 bff의 API 노드에 calls 엣지와 matched를 채우고, 같은 경로의 메서드 노드를 모두 잇고, adapters[]에 들지 않는다', async (t) => {
  const { g, data } = await project(t);
  assert.deepEqual(g.adapters.map((a) => a.name), ['router', 'bff']);
  assert.deepEqual(callsOf(g, '/items'), ['/api/badges', '/api/items', 'POST /api/items']);
  assert.deepEqual(callsOf(g, '/items/:id'), ['/api/items/:id', '/api/items/:id/save', '/api/stores/:store/orders', '/api/stores/:store/orders/:id']);
  assert.deepEqual(callsOf(g, '/account'), ['/api/orders', '/api/profile']);
  const missing = g.get('screen', '/items').props.apiLiterals.find((l) => l.path === '/api/missing');
  assert.deepEqual(missing.matched, []);
  const items = g.get('screen', '/items').props.apiLiterals.find((l) => l.path === '/api/items');
  assert.deepEqual([...items.matched].sort(), ['/api/items', 'POST /api/items']);
  // 화면 apis 읽기 상태: 맞지 않는 리터럴이 있으면 partial
  assert.equal(readingOf(g.get('screen', '/items'), 'apis'), 'partial');
  assert.match(g.get('screen', '/items').props.readingNotes.apis, /\/api\/missing/);
  assert.equal(readingOf(g.get('screen', '/items/:id'), 'apis'), 'rule');
  assert.deepEqual(data.screens.find((s) => s.path === '/items/:id').apis.sort(), callsOf(g, '/items/:id'));
  // 맞는 노드가 없는 리터럴은 위치마다 router.unknown-api 한 건(근거 줄 포함)
  const unknown = codes(data, 'router.unknown-api');
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].level, 'warn');
  assert.deepEqual(unknown[0].subject, { kind: 'screen', id: '/items' });
  assert.deepEqual(unknown[0].anchors, [{ file: 'web/src/pages/Items.tsx', line: 6, excerpt: "const ping = () => get('/api/missing');" }]);
});

test('SC-4 확장 닫힘은 리터럴에만: 화면 files·source·mockVia·fixedVia는 1.1.1 파일 닫힘 그대로(부분 모듈 글자가 출처 분류에 닿지 않음)', async (t) => {
  const { g } = await project(t);
  const items = g.get('screen', '/items').props;
  assert.deepEqual(items.files, ['web/src/pages/Items.tsx', 'web/src/components/index.ts', 'web/src/components/Badge.tsx']);
  assert.deepEqual([items.source, items.mockVia, items.fixedVia], ['live', [], []]);
  const detail = g.get('screen', '/items/:id').props;
  assert.deepEqual(detail.files, ['web/src/pages/ItemDetail.tsx']);
  assert.deepEqual([detail.source, detail.mockVia, detail.fixedVia], ['live', [], []]);
});

test('SC-4 고아 API는 관측한 화면 호출만 세고, 여정 apis에만 있는 API는 journey.api-not-observed', async (t) => {
  const { data } = await project(t);
  assert.deepEqual(data.orphans.apis.sort(), ['/api/items/:id/remove', '/api/unused']);
  const w = codes(data, 'journey.api-not-observed');
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].subject, { kind: 'step', id: 'j1/s1' });
  assert.match(w[0].msg, /\/api\/items\/:id\/remove/);
});

test('SC-4 hookApi 합집합: 대응표 엣지는 1.1.1처럼 남고, 설정 키마다 리터럴로도 연결되면 router.hookapi-redundant, 대응표로만 연결되면 router.hookapi-only', async (t) => {
  const cfg = { ...CFG, router: { ...CFG.router, hookApi: { Items: '/api/items', Secret: '/api/secret-hook', Nothing: '/api/nothing' } } };
  const { g, data } = await project(t, { cfg });
  assert.deepEqual(callsOf(g, '/account'), ['/api/orders', '/api/profile', '/api/secret-hook']);
  assert.deepEqual(callsOf(g, '/items'), ['/api/badges', '/api/items', 'POST /api/items']);
  const redundant = codes(data, 'router.hookapi-redundant');
  const only = codes(data, 'router.hookapi-only');
  assert.deepEqual(redundant.map((p) => p.subject.id).sort(), ['router.hookApi.Items', 'router.hookApi.Nothing']);
  assert.deepEqual(only.map((p) => p.subject.id), ['router.hookApi.Secret']);
  assert.match(only[0].msg, /\/account/);
  assert.equal(only[0].anchors[0].file, 'map/config.json');
  assert.equal(readingOf(g.get('screen', '/account'), 'apis'), 'partial');
  assert.equal(readingOf(g.get('screen', '/items/:id'), 'apis'), 'rule');
  // hookApi가 없으면 두 경고가 없다
  const plain = await project(t);
  assert.equal(codes(plain.data, 'router.hookapi-redundant').length + codes(plain.data, 'router.hookapi-only').length, 0);
});

test('SC-4 API 노드 어댑터가 없으면 리터럴마다 router.unknown-api이고 텍스트 출력은 묶음 줄 한 줄', async (t) => {
  const { data } = await project(t, { cfg: { ...CFG, adapters: ['router'] } });
  const unknown = codes(data, 'router.unknown-api');
  assert.equal(unknown.length, 8);
  const lines = textLines(checkProblems(data, { floors: {} })).filter((l) => l.includes('router.unknown-api'));
  assert.deepEqual(lines, ['△ router.unknown-api 8건(화면 3): livemap check --json']);
});

test('SC-4 연결 단계 실패는 오류 이슈로 남고 build는 계속된다', async (t) => {
  const files = { 'map/adapters/breaker.mjs': "export default function breaker(g) { g.get('screen', '/items').props.apiLiterals = 'bad'; return null; }\n" };
  const { g, data } = await project(t, { cfg: { ...CFG, adapters: ['router', 'bff', 'breaker'] }, files });
  assert.deepEqual(g.adapters.map((a) => [a.name, a.status]), [['router', 'ok'], ['bff', 'ok'], ['breaker', 'ok']]);
  const errors = checkProblems(data, { floors: {} }).filter((p) => p.level === 'error');
  assert.equal(errors.length, 1);
  assert.match(errors[0].msg, /^연결 단계: /);
});
