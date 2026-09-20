// 다리 단계 검사(스펙 PN-12, 「livemap 다리」, DEC-34·DEC-40·DEC-42·DEC-47): 연결 단계 뒤에 화면·API 를 Graphify 파일 노드와 로그인 노드에 잇고,
// 기존 invokes·touches 사슬이 합친 SQL 노드(props.graphifyIds)로 옮겨 붙었는지 세고, 못 맞춘 짝을 두 방향으로 경고한다. 작은 합성 그래프로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph, NODE_KINDS, runAdapter } from '../src/lib/graph.mjs';
import graphify from '../src/adapters/graphify.mjs';
import { bridgeArchitecture, matchFunctionLabel } from '../src/bridge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'graphify', 'graph.json');
const GRAPH = 'graphify-out/graph.json';
const doc = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const SERVER = { file: 'app/server.mjs', line: 1, rule: 'bff:route()' };
const fsOf = (d) => ({ has: (p) => p === GRAPH && d !== null, read: () => JSON.stringify(d) });

// router·bff·migrations 어댑터와 연결 단계가 만든 모양의 livemap 그래프. 화면 → API calls 는 연결 단계가 이미 만들었다
function project(d = doc(), { graphifyAdapter = true } = {}) {
  const g = new Graph();
  g.add('screen', '/live', '/live', { file: 'web/src/pages/Live.tsx' }, { file: 'web/src/App.tsx', line: 1, rule: 'router:<Route path>' });
  g.add('screen', '/admin/live', '/admin/live', { file: 'web/src/admin/Live.tsx' }, { file: 'web/src/App.tsx', line: 2, rule: 'router:<Route path>' });
  g.add('screen', '/static', '/static', { file: null }, { file: 'web/src/App.tsx', line: 3, rule: 'router:<Route path>' });
  g.add('screen', '/gone', '/gone', { file: 'web/src/pages/Gone.tsx' }, { file: 'web/src/App.tsx', line: 4, rule: 'router:<Route path>' });
  g.add('api', '/api/resorts', 'GET /api/resorts', { method: 'GET', calls: ['list_resorts'] }, SERVER);
  g.add('api', '/api/items/:id', 'GET /api/items/:id', { method: 'GET', calls: ['get_item'] }, SERVER);
  g.add('api', '/api/login', 'POST /api/login', { method: 'POST', calls: ['auth:token'] }, SERVER);
  g.add('api', '/api/password', 'POST /api/password', { method: 'POST', calls: ['auth:user', 'auth:logout'] }, SERVER);
  g.add('api', '/api/session', 'GET /api/session', { method: 'GET', calls: ['auth:user'] }, SERVER);
  g.add('api', '/api/ghost', 'GET /api/ghost', { method: 'GET', calls: [] }, { file: 'app/ghost.mjs', line: 1, rule: 'bff:route()' });
  g.add('function', 'list_resorts', 'list_resorts', { qualified: 'app.list_resorts' }, { file: 'supabase/migrations/20260101000000_init.sql', line: 3, rule: 'migrations:create function' });
  g.add('function', 'get_item', 'get_item', { qualified: 'app.get_item' }, { file: 'supabase/migrations/20260103000000_items.sql', line: 1, rule: 'migrations:create function' });
  g.add('table', 'app.resorts', 'resorts', { schema: 'app' }, { file: 'supabase/migrations/20260101000000_init.sql', line: 1, rule: 'migrations:create table' });
  g.add('table', 'app.items', 'items', { schema: 'app' }, { file: 'supabase/migrations/20260103000000_items.sql', line: 1, rule: 'migrations:create table' });
  g.link('api', '/api/resorts', 'invokes', 'function', 'list_resorts');
  g.link('api', '/api/items/:id', 'invokes', 'function', 'get_item');
  g.link('function', 'list_resorts', 'touches', 'table', 'app.resorts');
  g.link('function', 'list_resorts', 'touches', 'table', 'app.items');
  g.link('function', 'get_item', 'touches', 'table', 'app.items');
  if (graphifyAdapter) runAdapter(g, 'graphify', (g) => graphify(g, fsOf(d), {}));
  g.link('screen', '/live', 'calls', 'api', '/api/resorts');
  g.link('screen', '/admin/live', 'calls', 'api', '/api/items/:id');
  return g;
}
const edges = (g, kind, from = '') => g.edges.filter((e) => e.kind === kind && e.from.startsWith(from)).map((e) => `${e.from} → ${e.to}`).sort();
const issues = (g, code) => g.issues.filter((i) => i.code === code);

test('SC-2 renders: 화면 props.file 로 파일 노드를 찾아 잇는다. 폴더 접두 라벨(admin/Live.tsx)도 맞고, 파일이 없거나 파일 노드가 없는 화면은 잇지 않는다', () => {
  const g = project();
  const stats = bridgeArchitecture(g, fsOf(null), {});
  assert.deepEqual(edges(g, 'renders'), ['screen:/admin/live → module:web/src/admin/Live.tsx', 'screen:/live → module:web/src/pages/Live.tsx']);
  assert.equal(stats.byKind.renders, 2);
  assert.deepEqual(stats.misses.renders, ['/gone']);
});

test('SC-2 defined_in: API src.file 로 서버 파일 노드에 잇는다. 파일 노드가 없는 API 는 잇지 않는다', () => {
  const g = project();
  const stats = bridgeArchitecture(g, fsOf(null), {});
  assert.deepEqual(edges(g, 'defined_in'), ['/api/items/:id', '/api/login', '/api/password', '/api/resorts', '/api/session'].map((a) => `api:${a} → module:app/server.mjs`));
  assert.equal(stats.byKind.defined_in, 5);
  assert.deepEqual(stats.misses.defined_in, ['/api/ghost']);
});

test('SC-2 로그인: props.calls 의 auth: 접두마다 로그인 노드에 invokes. 노드 셋에 호출 넷(/api/password 가 둘을 부른다)', () => {
  const g = project();
  const stats = bridgeArchitecture(g, fsOf(null), {});
  const authNodes = [...g.nodes.values()].filter((n) => n.props.auth);
  assert.deepEqual(authNodes.map((n) => n.label).sort(), ['auth:logout', 'auth:token', 'auth:user']);
  for (const n of authNodes) assert.equal(n.props.external, true);
  // AUTH_KIND_DECISION=A: 새 노드 종류 auth. summary·functions[] 가 세는 function 이 아니다
  assert.ok(NODE_KINDS.includes('auth'));
  assert.deepEqual(g.of('auth').map((n) => n.id).sort(), ['auth:logout', 'auth:token', 'auth:user']);
  assert.equal(g.of('function').length, 2);
  const authEdges = g.edges.filter((e) => e.kind === 'invokes' && authNodes.some((n) => e.to === `${n.kind}:${n.id}`));
  assert.equal(authEdges.length, 4);
  assert.deepEqual(g.out('api', '/api/password', 'invokes').filter((n) => n.props.auth).map((n) => n.label).sort(), ['auth:logout', 'auth:user']);
  assert.deepEqual([stats.byKind.auth, stats.authNodes], [4, 3]);
  // API 에서 나가는 invokes 는 DB 함수 둘 + 로그인 넷
  assert.equal(edges(g, 'invokes', 'api:').length, 6);
  assert.equal(stats.made, 2 + 5 + 4);
});

test('SC-23 옮겨 붙임: invokes·touches 의 끝점이 graphifyIds 를 가진 합친 SQL 노드인 엣지를 엣지 기준·객체 기준으로 나눠 센다(DEC-40)', () => {
  const g = project();
  const stats = bridgeArchitecture(g, fsOf(null), {});
  // list_resorts 는 app.list_resorts() 라벨에 맞고 get_item 은 Graphify 에 없다. app.resorts 는 맞고 app.items 는 livemap 만 안다
  assert.deepEqual(stats.matched, { fnEdges: [1, 2], fnObjects: [1, 2], tableEdges: [1, 3], tableObjects: [1, 2] });
  assert.deepEqual(stats.byKind, { renders: 2, defined_in: 5, auth: 4, calls: 2, invokes: 2, touches: 3 });
  assert.equal(stats.moved, 2 + 2 + 3);
  // 기존 사슬의 엣지 자체는 그대로다(끝점 노드가 합친 노드가 된 것이다)
  assert.deepEqual(edges(g, 'invokes', 'api:').filter((e) => e.includes('function:')), ['api:/api/items/:id → function:get_item', 'api:/api/resorts → function:list_resorts']);
  assert.deepEqual(edges(g, 'touches'), ['function:get_item → table:app.items', 'function:list_resorts → table:app.items', 'function:list_resorts → table:app.resorts']);
});

test('SC-23 이름 규칙 (^|\\.)이름\\(\\)$: 스키마 접두를 넘고 접미 일치·다른 스키마 이름은 걸러낸다', () => {
  assert.deepEqual(matchFunctionLabel('list_resorts', ['app.list_resorts()', 'app.xlist_resorts()', 'list_resorts()', 'other.list_resorts()', 'app.list_resorts_v2()', 'app.list_resorts']), ['app.list_resorts()', 'list_resorts()', 'other.list_resorts()']);
  assert.deepEqual(matchFunctionLabel('a.b', ['x.a.b()', 'a.b()', 'aXb()']), ['x.a.b()', 'a.b()']);
});

test('SC-3 못 맞춘 짝은 두 방향으로 경고한다: livemap 만 아는 테이블은 architecture.bridge-unmatched, 어떤 함수도 닿지 않는 Graphify 테이블은 architecture.table-unreached', () => {
  const g = project();
  const stats = bridgeArchitecture(g, fsOf(null), {});
  assert.deepEqual(stats.unmatched, { livemapOnly: 1, unreached: 1 });
  const um = issues(g, 'architecture.bridge-unmatched');
  assert.equal(um.length, 1);
  assert.deepEqual([um[0].level, um[0].subject], ['warn', { kind: 'table', id: 'app.items' }]);
  assert.match(um[0].message, /app\.items/);
  assert.match(um[0].message, /touches 2/);
  assert.deepEqual(um[0].anchors, [{ file: 'supabase/migrations/20260103000000_items.sql', line: 1 }]);
  const ur = issues(g, 'architecture.table-unreached');
  assert.equal(ur.length, 1);
  assert.deepEqual([ur[0].level, ur[0].subject], ['warn', { kind: 'table', id: 'app.bookings' }]);
  assert.deepEqual(ur[0].anchors, [{ file: 'supabase/migrations/20260102000000_more.sql', line: 3 }]);
  // 방금 만든 로그인 노드나 livemap 테이블을 다시 찾아 맞음으로 세지 않는다(DEC-40)
  assert.equal(stats.matched.tableEdges[0], 1);
});

test('SC-23 화면 → API calls 는 다시 만들지 않는다: 다리 전후 calls 엣지가 같고 moved 에 그대로 센다', () => {
  const g = project();
  const before = edges(g, 'calls', 'screen:');
  const stats = bridgeArchitecture(g, fsOf(null), {});
  assert.deepEqual(edges(g, 'calls', 'screen:'), before);
  assert.equal(before.length, 2);
  assert.equal(stats.byKind.calls, 2);
  // 다리가 만든 엣지는 renders·defined_in·로그인 invokes 뿐이다
  const kinds = new Map();
  for (const e of g.edges.filter((e) => e.props?.bridge)) kinds.set(e.kind, (kinds.get(e.kind) || 0) + 1);
  assert.deepEqual([...kinds].sort(), [['defined_in', 5], ['invokes', 4], ['renders', 2]]);
  assert.deepEqual(g.architecture.bridges, stats);
});

test('SC-2 graphify 어댑터가 돌지 않은 프로젝트에서는 다리가 아무것도 하지 않고 이슈도 없다(기존 프로젝트는 예전과 같이 돈다)', () => {
  const g = project(doc(), { graphifyAdapter: false });
  const n = g.edges.length;
  assert.equal(bridgeArchitecture(g, fsOf(null), {}), null);
  assert.equal(g.edges.length, n);
  assert.deepEqual(g.issues, []);
  assert.equal(g.architecture, null);
});

test('SC-4 그래프 파일이 없으면 다리는 새 다리 없이 돌고 못 맞춘 짝 경고를 내지 않는다', () => {
  const g = project(null);
  const stats = bridgeArchitecture(g, fsOf(null), {});
  assert.deepEqual([stats.made, stats.moved, stats.byKind.renders, stats.byKind.defined_in, stats.byKind.auth], [0, 7, 0, 0, 0]);
  assert.equal(stats.matched, null);
  assert.deepEqual(g.issues.map((i) => i.code), ['architecture.graph-missing']);
});
