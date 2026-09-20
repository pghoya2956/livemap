// SQL 라벨 합치기와 결정성 검사(스펙 PN-43, DEC-43): Graphify 는 (migration 파일, 객체) 쌍마다 노드를 주므로 라벨 단위 논리 노드 하나로 합친다.
// 합친 노드는 livemap 의 function·table 노드 자신이고 Graphify 노드 id 집합이 props.graphifyIds 에 남는다. 정의 자리 없는 라벨은 바깥 상대다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph, runAdapter } from '../src/lib/graph.mjs';
import graphify, { mergeSqlLabels } from '../src/adapters/graphify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'graphify', 'graph.json');
const GRAPH = 'graphify-out/graph.json';
const doc = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const INIT = 'supabase/migrations/20260101000000_init.sql', MORE = 'supabase/migrations/20260102000000_more.sql';

// migrations 어댑터가 먼저 만든 livemap 노드를 흉내 낸다(mini 픽스처 모양)
function livemapSql(g) {
  g.add('function', 'list_resorts', 'list_resorts', { qualified: 'app.list_resorts', migration: '20260101000000_init.sql' }, { file: INIT, line: 3, rule: 'migrations:create function' });
  g.add('table', 'app.resorts', 'resorts', { schema: 'app' }, { file: INIT, line: 1, rule: 'migrations:create table' });
  g.add('table', 'app.items', 'items', { schema: 'app' }, { file: 'supabase/migrations/20260103000000_items.sql', line: 1, rule: 'migrations:create table' });
  g.link('function', 'list_resorts', 'touches', 'table', 'app.resorts');
  g.link('function', 'list_resorts', 'touches', 'table', 'app.items');
}
function run(d, pre = livemapSql) {
  const g = new Graph();
  pre(g);
  const fs = { has: (p) => p === GRAPH, read: () => JSON.stringify(d) };
  runAdapter(g, 'graphify', (g) => graphify(g, fs, {}));
  return g;
}
const sqlNode = (id, label, community, source_file, source_location = 'L1') => ({ id, label, _origin: 'ast', community, community_name: `c${community}`, file_type: 'code', source_file, source_location });

test('SC-23 같은 SQL 라벨 노드 여럿이 합친 노드 하나: livemap function·table 에 graphifyIds(정렬)가 실리고 함수·테이블 수는 그대로다', () => {
  const g = run(doc());
  const fn = g.get('function', 'list_resorts');
  assert.deepEqual(fn.props, { qualified: 'app.list_resorts', migration: '20260101000000_init.sql', schema: 'app', graphifyIds: ['supabase_migrations_20260101000000_init_app_list_resorts', 'supabase_migrations_20260102000000_more_app_list_resorts'], community: 4, communityName: '20260101000000_init.sql' });
  assert.deepEqual(fn.src, { file: INIT, line: 3, rule: 'migrations:create function' }, 'migrations 의 src 가 남는다');
  const tb = g.get('table', 'app.resorts');
  assert.deepEqual(tb.props.graphifyIds, ['app_resorts', 'supabase_migrations_20260101000000_init_app_resorts', 'supabase_migrations_20260102000000_more_app_resorts'], '참조 노드(source_file 없음)도 증거로 든다');
  assert.equal(g.of('function').length, 1);
  // Graphify 만 정의 자리를 아는 테이블은 table 노드로 만들고 migration 자리를 src 로 둔다
  const bookings = g.get('table', 'app.bookings');
  assert.deepEqual([bookings.label, bookings.props.schema, bookings.props.graphifyIds, bookings.props.community], ['bookings', 'app', ['supabase_migrations_20260102000000_more_app_bookings'], 5]);
  assert.deepEqual(bookings.src, { file: MORE, line: 3, rule: 'graphify:sql' });
  assert.equal(g.of('table').length, 3, 'livemap 테이블 둘 + Graphify 만 아는 app.bookings');
  // 함수 라벨은 livemap function 이 없으면 새로 만든다(한정 이름을 남긴다)
  const d = doc();
  const alone = run(d, (g) => g.add('table', 'app.resorts', 'resorts', { schema: 'app' }));
  assert.deepEqual(alone.get('function', 'list_resorts').props, { qualified: 'app.list_resorts', schema: 'app', graphifyIds: ['supabase_migrations_20260101000000_init_app_list_resorts', 'supabase_migrations_20260102000000_more_app_list_resorts'], community: 4, communityName: '20260101000000_init.sql' });
  assert.deepEqual(alone.get('function', 'list_resorts').src, { file: INIT, line: 3, rule: 'graphify:sql' });
});

test('SC-24 노드 순서를 뒤집어도 합친 노드의 묶음(community) 배정과 증거 목록이 같다', () => {
  const nodes = [sqlNode('b_t', 'app.t', 2, 'supabase/migrations/2_b.sql', 'L2'), sqlNode('a_t', 'app.t', 1, 'supabase/migrations/1_a.sql', 'L5'), sqlNode('ref_t', 'app.t', 3, '', ''), sqlNode('c_f', 'app.f()', 3, 'supabase/migrations/3_c.sql')];
  const a = mergeSqlLabels(nodes), b = mergeSqlLabels(nodes.slice().reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((m) => [m.label, m.ids, m.sites, m.community, m.communityName, m.schema, m.name, m.isFn, m.file, m.line]), [
    ['app.f()', ['c_f'], 1, 3, 'c3', 'app', 'f', true, 'supabase/migrations/3_c.sql', 1],
    ['app.t', ['a_t', 'b_t', 'ref_t'], 2, 1, 'c1', 'app', 't', false, 'supabase/migrations/1_a.sql', 5],
  ]);
  const g1 = run(doc());
  const d = doc(); d.nodes.reverse(); d.links.reverse();
  const g2 = run(d);
  const pick = (g) => [...g.nodes.values()].filter((n) => n.props.graphifyIds).map((n) => [`${n.kind}:${n.id}`, n.props.community, n.props.graphifyIds]).sort();
  assert.deepEqual(pick(g1), pick(g2));
  assert.equal(pick(g1).length, 4, 'graphifyIds 는 정의 자리가 있는 라벨 셋과 바깥 상대 auth.users 에만 있다');
});

test('SC-24 정의 자리가 둘 이상이면 source_file 사전순(=migration 생성 순) 첫 자리의 커뮤니티를 고른다', () => {
  const g = run(doc());
  // app.resorts 는 init(커뮤니티 4)·more(5) 두 자리. init 이 앞선다
  assert.deepEqual([g.get('table', 'app.resorts').props.community, g.get('table', 'app.resorts').props.communityName], [4, '20260101000000_init.sql']);
  assert.equal(g.get('function', 'list_resorts').props.community, 4);
  // 같은 파일 안에 둘이면 id 순으로 고른다(결정적)
  const [m] = mergeSqlLabels([sqlNode('z', 'app.x', 9, 'supabase/migrations/1.sql'), sqlNode('a', 'app.x', 7, 'supabase/migrations/1.sql')]);
  assert.equal(m.community, 7);
});

test('SC-23 정의 자리가 없는 라벨은 바깥 상대(symbol, external)로 두고 schema 를 싣는다. 참조 엣지는 그 노드로 간다', () => {
  const g = run(doc());
  const users = g.get('symbol', 'auth.users');
  assert.deepEqual(users.props, { external: true, sql: true, schema: 'auth', graphifyIds: ['auth_users'], community: null, communityName: null });
  assert.equal(users.src, null);
  assert.equal(g.nodes.has('table:auth.users'), false, 'table 수(2.0.2 dbTables)를 바꾸지 않는다');
  assert.ok(g.edges.some((e) => e.from === 'function:list_resorts' && e.kind === 'reads' && e.to === 'symbol:auth.users'));
  // 스키마 접두 없는 조각(auth·is 같은 낱말)도 정의 자리가 없으면 바깥 상대이고 schema 는 null
  const [m] = mergeSqlLabels([sqlNode('w', 'is', 1, '', '')]);
  assert.deepEqual([m.sites, m.schema, m.name, m.isFn], [0, null, 'is', false]);
});

test('OQ-09 결정 b: 참조만 라벨이 livemap 테이블과 같은 이름이면 그 테이블에 graphifyRefs 로 붙이고 바깥 상대로 두지 않는다. 다리 매칭(graphifyIds)에는 세지 않는다', () => {
  const g = run(doc());
  const items = g.get('table', 'app.items');
  assert.deepEqual(items.props, { schema: 'app', graphifyRefs: ['app_items_ref'] });
  assert.equal(items.props.graphifyIds, undefined, 'bridge-unmatched 경고는 그대로 난다');
  assert.equal(g.nodes.has('symbol:app.items'), false);
  assert.ok(g.edges.some((e) => e.from === 'function:list_resorts' && e.kind === 'reads' && e.to === 'table:app.items'), '참조 엣지는 livemap 테이블로 간다');
  assert.equal(g.architecture.graphify.kept.sqlExternal, 1, '바깥 상대는 auth.users 하나');
  assert.deepEqual([...g.nodes.values()].filter((n) => n.kind === 'symbol' && n.props.sql).map((n) => n.id), ['auth.users']);
});

test('OQ-09 결정 b: 스키마 접두 없는 낱말 조각(is)은 정의 자리가 없으면 노드로 만들지 않고 dropped.sqlNoise 에 센다', () => {
  const g = run(doc());
  assert.equal(g.nodes.has('symbol:is'), false);
  assert.equal(g.architecture.graphify.dropped.sqlNoise, 1);
  assert.equal(g.edges.some((e) => e.to === 'symbol:is'), false);
});

test('SC-23 스키마 접두 없는 SQL 심볼(인덱스 이름)은 합치지 않고 파일 심볼로 둔다', () => {
  const g = run(doc());
  const idx = g.get('symbol', `${MORE}:resorts_name_idx`);
  assert.deepEqual([idx.props.module, idx.props.line, idx.props.graphifyId, idx.props.community], [MORE, 9, 'supabase_migrations_20260102000000_more_resorts_name_idx', 5]);
  assert.equal(idx.props.graphifyIds, undefined);
});
