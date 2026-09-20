// Graphify 어댑터 검사(스펙 PN-11, 「Graphify 그래프 계약」): 픽스처 fixtures/graphify/graph.json(가상 프로젝트)을 읽어
// 계약(최상위 키·반드시 있는 필드), file_type 분류, 파일 판정, 중첩 contains, 외부 노드, 엣지 props 보존, 모르는 relation, 조각 노드, 그래프 없음을 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph, runAdapter } from '../src/lib/graph.mjs';
import graphify, { REQUIRED_TOP, REQUIRED_NODE, REQUIRED_LINK, schemaProblems } from '../src/adapters/graphify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const BIN = join(PKG, 'bin', 'livemap.mjs');
const MINI = join(HERE, 'fixtures', 'mini');
const FIXTURE = join(HERE, 'fixtures', 'graphify', 'graph.json');
const GRAPH = 'graphify-out/graph.json';
const doc = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// 그래프 문서 하나만 있는 가짜 fs 로 어댑터를 돌린다. pre 로 다른 어댑터가 먼저 만든 노드를 흉내 낸다
function run(d, { pre = () => {}, cfg = {} } = {}) {
  const g = new Graph();
  pre(g);
  const fs = { has: (p) => p === GRAPH && d !== null, read: (p) => { if (p !== GRAPH) throw new Error(`없는 파일 ${p}`); return JSON.stringify(d); }, mtime: () => '2026-09-19T00:00:00.000Z' };
  runAdapter(g, 'graphify', (g) => graphify(g, fs, cfg));
  return g;
}
const edges = (g, kind) => g.edges.filter((e) => e.kind === kind).map((e) => `${e.from} → ${e.to}`).sort();
const edge = (g, from, kind, to) => g.edges.find((e) => e.from === from && e.kind === kind && e.to === to);
const status = (g) => g.adapters.find((a) => a.name === 'graphify').status;

test('SC-1 계약: 최상위 키 여섯이 있으면 읽고 덧붙은 키(built_at_commit)는 무시한다. 통계가 architecture.graphify 에 남는다', () => {
  const g = run(doc());
  assert.equal(status(g), 'ok');
  assert.deepEqual(REQUIRED_TOP, ['directed', 'multigraph', 'graph', 'nodes', 'links', 'hyperedges']);
  const s = g.architecture.graphify;
  assert.deepEqual([s.nodes, s.edges, s.relations, s.communities, s.inferred, s.typeOnly, s.deferred], [37, 44, 13, 5, 1, 2, 1]);
  assert.deepEqual(s.unknownRelations, { decorates: 1 });
  assert.deepEqual([s.generatedAt, s.tool, s.builtAtCommit], ['2026-09-19T00:00:00.000Z', 'graphify', '0000000']);
  // livemap 노드가 먼저 없는 그래프에서는 참조만 라벨 app.items 도 바깥 상대다(sql-merge 검사가 livemap table 이 있을 때를 본다)
  assert.deepEqual(s.kept, { modules: 9, symbols: 16, external: 2, sqlFunctions: 1, sqlTables: 2, sqlExternal: 2 });
  // 스키마 접두 없는 SQL 낱말 조각(is)은 버리고 그리로 가는 엣지도 버린다(OQ-09 결정 b)
  assert.deepEqual(s.dropped, { fragments: 1, sqlNoise: 1, edges: 1 });
});

test('SC-1 계약: 최상위 키 하나가 없으면 architecture.graph-schema 오류이고 반쯤 읽은 그래프로 노드를 싣지 않는다', () => {
  for (const key of REQUIRED_TOP) {
    const d = doc();
    delete d[key];
    const g = run(d);
    assert.equal(status(g), 'partial', key);
    assert.equal(g.nodes.size, 0, key);
    assert.deepEqual(g.issues.map((i) => [i.level, i.code]), [['error', 'architecture.graph-schema']], key);
    assert.equal(g.architecture.graphify, null, key);
  }
});

test('SC-1 계약: 반드시 있는 노드 필드 여섯·링크 필드 여덟 누락은 오류, 없을 수 있는 필드 누락은 통과', () => {
  assert.deepEqual(REQUIRED_NODE, ['id', 'label', 'community', 'community_name', 'file_type', 'source_file']);
  assert.deepEqual(REQUIRED_LINK, ['source', 'target', 'relation', 'confidence', 'confidence_score', 'source_file', 'source_location', 'weight']);
  for (const key of REQUIRED_NODE) {
    const d = doc();
    delete d.nodes[3][key];
    const g = run(d);
    assert.equal(g.nodes.size, 0, key);
    assert.equal(g.issues[0]?.code, 'architecture.graph-schema', key);
    assert.match(g.issues[0].message, new RegExp(key), key);
  }
  for (const key of REQUIRED_LINK) {
    const d = doc();
    delete d.links[5][key];
    const g = run(d);
    assert.equal(g.nodes.size, 0, key);
    assert.equal(g.issues[0]?.code, 'architecture.graph-schema', key);
  }
  // 없을 수 있는 필드: 노드 _origin·_callable·source_location·type·external·norm_label, 링크 context·_origin·type_only·deferred
  const d = doc();
  for (const n of d.nodes) for (const k of ['_origin', '_callable', '_callable_class', 'source_location', 'type', 'external', 'norm_label']) delete n[k];
  for (const l of d.links) for (const k of ['context', '_origin', 'type_only', 'deferred']) delete l[k];
  assert.deepEqual(schemaProblems(d), []);
  const g = run(d);
  assert.equal(status(g), 'ok');
  assert.deepEqual(g.issues, []);
});

test('SC-1 분류는 file_type 으로 한다: type 필드 없는 concept 노드(주석의 문서 참조)가 서버 코드 심볼로 가지 않고 외부로 간다', () => {
  const g = run(doc());
  const rfc = g.get('module', 'RFC-0001');
  assert.ok(rfc, 'concept 노드는 외부 module');
  assert.equal(rfc.props.external, true);
  assert.equal(g.nodes.has('symbol:app/server.mjs:RFC-0001'), false);
  const react = g.get('module', 'react');
  assert.deepEqual([react.props.external, react.props.graphifyId, react.src], [true, 'ref_react', null]);
  assert.equal(g.of('module').filter((m) => m.props.external).length, 2);
});

test('SC-1 파일 판정: 라벨이 파일명 모양이고 source_file 의 basename 또는 dir/basename 과 같으면 파일(module, id 는 저장소 기준 경로)', () => {
  const g = run(doc());
  const files = g.of('module').filter((m) => !m.props.external).map((m) => m.id).sort();
  assert.deepEqual(files, ['app/server.mjs', 'supabase/migrations/20260101000000_init.sql', 'supabase/migrations/20260102000000_more.sql', 'web/src/App.tsx', 'web/src/admin/Live.tsx', 'web/src/lib/queries.ts', 'web/src/mock/index.ts', 'web/src/pages/Live.tsx', 'web/src/pages/Mocked.tsx']);
  // 파일명이 겹쳐 라벨에 상위 폴더가 붙은 파일(admin/Live.tsx)도 파일이다
  const admin = g.get('module', 'web/src/admin/Live.tsx');
  assert.deepEqual([admin.label, admin.props.community, admin.props.communityName, admin.props.graphifyId], ['admin/Live.tsx', 2, 'Mocked.tsx', 'web_src_admin_live']);
  assert.deepEqual(admin.src, { file: 'web/src/admin/Live.tsx', line: 1, rule: 'graphify:file' });
  // 심볼이 없는 barrel 파일(contains 출발점이 아님)도 파일이다. 라벨이 파일 모양이어도 source_file 끝과 다르면 심볼이다
  assert.ok(g.get('module', 'web/src/mock/index.ts'));
  assert.ok(g.get('symbol', 'web/src/pages/Live.tsx:fixture.json'));
  assert.equal(g.nodes.has('module:web/src/pages/Live.tsx:fixture.json'), false);
});

test('SC-1 중첩 contains: 파일 → 심볼 → 중첩 심볼이 contains 로 이어지고, 중첩 심볼은 module 이 아니다. method 는 contains 다', () => {
  const g = run(doc());
  assert.ok(edge(g, 'module:web/src/pages/Live.tsx', 'contains', 'symbol:web/src/pages/Live.tsx:Live'));
  assert.ok(edge(g, 'symbol:web/src/pages/Live.tsx:Live', 'contains', 'symbol:web/src/pages/Live.tsx:load()'));
  assert.equal(g.of('module').some((m) => m.label === 'load()'), false);
  const method = edge(g, 'symbol:app/server.mjs:Mailer', 'contains', 'symbol:app/server.mjs:.send()');
  assert.deepEqual(method.props, { confidence: 'EXTRACTED', via: 'method' });
  assert.equal(edges(g, 'contains').length, 21);
});

test('SC-1 심볼 id 는 <파일>:<이름>. 같은 파일에 같은 이름이 둘이면 @<위치>를 붙여 나눈다(입력 순서와 무관)', () => {
  const g = run(doc());
  const load = g.get('symbol', 'web/src/pages/Live.tsx:load()');
  assert.deepEqual(load.props, { module: 'web/src/pages/Live.tsx', line: 7, callable: true, class: false, graphifyId: 'web_src_pages_live_live_load', community: 1, communityName: 'App.tsx' });
  assert.deepEqual(load.src, { file: 'web/src/pages/Live.tsx', line: 7, rule: 'graphify:symbol' });
  assert.ok(g.get('symbol', 'web/src/pages/Live.tsx:submit()@L8'));
  assert.ok(g.get('symbol', 'web/src/pages/Live.tsx:submit()@L15'));
  assert.equal(g.nodes.has('symbol:web/src/pages/Live.tsx:submit()'), false);
  assert.equal(g.get('symbol', 'app/server.mjs:Mailer').props.class, true);
  const d = doc(); d.nodes.reverse(); d.links.reverse();
  const r = run(d);
  assert.deepEqual([...r.nodes.keys()].sort(), [...g.nodes.keys()].sort());
});

test('SC-1 엣지: relation 을 종류에 대응하고 confidence·typeOnly·deferred 를 props 에 남긴다. 같은 module 짝의 import 는 하나로 합친다', () => {
  const g = run(doc());
  assert.deepEqual(edges(g, 'imports'), [
    'module:web/src/App.tsx → module:react',
    'module:web/src/App.tsx → module:web/src/pages/Live.tsx',
    'module:web/src/App.tsx → module:web/src/pages/Mocked.tsx',
    'module:web/src/admin/Live.tsx → module:web/src/lib/queries.ts',
    'module:web/src/mock/index.ts → module:web/src/pages/Mocked.tsx',
    'module:web/src/pages/Live.tsx → module:web/src/lib/queries.ts',
    'module:web/src/pages/Mocked.tsx → module:web/src/lib/queries.ts',
  ]);
  // 런타임 import 와 타입 전용 import 가 섞인 짝은 런타임 의존이다(typeOnly 없음). 타입 전용만이면 typeOnly, 동적 import 만이면 deferred
  // imports 엣지는 기여한 링크 중 가장 앞선 source_location 줄을 line 에 남긴다(층 위반의 at.line 근거, P5-15a)
  assert.deepEqual(edge(g, 'module:web/src/pages/Live.tsx', 'imports', 'module:web/src/lib/queries.ts').props, { confidence: 'EXTRACTED', line: 1 });
  assert.deepEqual(edge(g, 'module:web/src/admin/Live.tsx', 'imports', 'module:web/src/lib/queries.ts').props, { confidence: 'EXTRACTED', typeOnly: true, line: 1 });
  assert.deepEqual(edge(g, 'module:web/src/pages/Mocked.tsx', 'imports', 'module:web/src/lib/queries.ts').props, { confidence: 'EXTRACTED', deferred: true, line: 9 });
  // calls·indirect_call → calls(추정은 INFERRED), reads_from·references·indexes·cites → reads, inherits → inherits
  assert.equal(edges(g, 'calls').length, 4);
  assert.deepEqual(edge(g, 'symbol:web/src/pages/Live.tsx:submit()@L15', 'calls', 'symbol:web/src/lib/queries.ts:fetchResorts').props, { confidence: 'INFERRED' }, 'imports 가 아닌 엣지는 line 을 싣지 않는다');
  assert.deepEqual(edges(g, 'reads'), ['function:list_resorts → symbol:app.items', 'function:list_resorts → symbol:auth.users', 'function:list_resorts → table:app.resorts', 'module:app/server.mjs → module:RFC-0001', 'symbol:supabase/migrations/20260102000000_more.sql:resorts_name_idx → table:app.resorts']);
  assert.equal(g.nodes.has('symbol:is'), false, '접두 없는 조각은 노드가 아니다');
  assert.deepEqual(edge(g, 'module:app/server.mjs', 'reads', 'module:RFC-0001').props, { confidence: 'EXTRACTED', via: 'cites' });
  assert.deepEqual(edge(g, 'symbol:supabase/migrations/20260102000000_more.sql:resorts_name_idx', 'reads', 'table:app.resorts').props, { confidence: 'EXTRACTED', via: 'indexes' });
  assert.deepEqual(edges(g, 'inherits'), ['symbol:web/src/lib/queries.ts:AdminResort → symbol:web/src/lib/queries.ts:Resort']);
  assert.equal(g.edges.length, 38);
  // 2.0.2 엣지 모양 { from, to, kind } 는 그대로고 Graphify 엣지만 props 를 더 가진다
  for (const e of g.edges) assert.deepEqual(Object.keys(e), ['from', 'to', 'kind', 'props']);
});

test('SC-1 모르는 relation 은 오류 없이 무시하고 unknownRelations 에 이름과 건수만 남긴다', () => {
  const d = doc();
  d.links.push({ ...d.links[0], relation: 'decorates' }, { ...d.links[1], relation: 'annotates' });
  const g = run(d);
  assert.equal(status(g), 'ok');
  assert.deepEqual(g.architecture.graphify.unknownRelations, { annotates: 1, decorates: 2 });
  assert.equal(g.edges.some((e) => e.props?.via === 'decorates'), false);
  assert.deepEqual(g.issues, []);
});

test('SC-1 조각 노드(source_file 이 비고 들어오는 엣지 없음)는 버리고, 참조 노드(들어오는 엣지 있음)는 라벨로 합친다', () => {
  const g = run(doc());
  const ids = [...g.nodes.values()].flatMap((n) => [n.props.graphifyId, ...(n.props.graphifyIds || [])]).filter(Boolean);
  assert.equal(ids.includes('app_orphan'), false);
  assert.ok(ids.includes('app_resorts'), '참조 노드는 app.resorts 라벨의 증거로 남는다');
  assert.equal(g.architecture.graphify.dropped.fragments, 1);
  // 스키마 접두 없는 SQL 낱말 조각(is)은 들어오는 엣지가 있어도 버린다(OQ-09 결정 b). 그 증거 id 는 어느 노드에도 남지 않는다
  assert.equal(ids.includes('is_ref'), false);
  assert.equal(g.architecture.graphify.dropped.sqlNoise, 1);
});

test('SC-4 그래프 파일이 없으면 partial 로 보고하고 architecture.graph-missing 경고를 내며 노드를 만들지 않는다', () => {
  const g = run(null, { cfg: { architecture: { graph: GRAPH } } });
  assert.equal(status(g), 'partial');
  assert.match(g.adapters[0].error, /graphify-out\/graph\.json/);
  assert.equal(g.nodes.size, 0);
  assert.deepEqual(g.issues.map((i) => [i.level, i.code, i.subject]), [['warn', 'architecture.graph-missing', { kind: 'config', id: 'architecture.graph' }]]);
  assert.deepEqual(g.architecture, { graphify: null, graphMissing: true });
});

test('SC-4 명령: mini 사본에 graphify 어댑터를 넣고 그래프 파일이 없어도 build 종료 코드 0, check --json 에 architecture.graph-missing 한 건', () => {
  const dir = mkdtempSync(join(tmpdir(), 'livemap graphify 없음 검사-'));
  made.push(dir);
  cpSync(MINI, dir, { recursive: true });
  // mini 는 2.1.0부터 graphify 어댑터와 그래프 파일을 가진다. 그래프 파일만 지워 없음 경로를 만든다
  rmSync(join(dir, 'graphify-out'), { recursive: true, force: true });
  assert.ok(JSON.parse(readFileSync(join(dir, 'map/config.json'), 'utf8')).adapters.includes('graphify'));
  const run = (args) => { const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
  const b = run(['build']);
  assert.equal(b.code, 0, b.out + b.err);
  assert.match(b.out, /△ graphify: .*graphify-out\/graph\.json/);
  const c = run(['check', '--json']);
  const j = JSON.parse(c.out);
  const missing = j.problems.filter((p) => p.code === 'architecture.graph-missing');
  assert.equal(missing.length, 1);
  assert.deepEqual([missing[0].level, missing[0].subject, missing[0].resolutions], ['warn', { kind: 'config', id: 'architecture.graph' }, ['config']]);
  // mini 의 기존 오류 5건은 그대로다(그래프 없음이 오류를 더하지 않는다)
  assert.equal(j.errors, 5);
});
