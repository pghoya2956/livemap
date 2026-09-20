// 선언 읽개와 대조 단계 검사(스펙 PN-15·PN-16·PN-19, 「검사 규칙」): 작은 합성 그래프와 인라인 선언으로 층 위반, 타입 전용 링크 제외, 미배정 파일, 빈 층,
// 부품 폴더 없음, 그림에만 있는 부품, 바깥 상대 미선언, id 중복, 흐름 좌표 없음, 끊김, 커뮤니티 없는 노드 물려받기, 폴더 겹침(가장 깊은 선언이 이김)을 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../src/lib/graph.mjs';
import { readArchitectureDir, parsePath } from '../src/lib/architecture-md.mjs';
import { architectureStage } from '../src/architecture.mjs';

const DIR = 'map/architecture';
// 파일 맵으로 만든 가짜 fs. has 는 폴더도 참(그 아래 파일이 있으면)
function fakeFs(files) {
  const keys = () => Object.keys(files);
  const under = (d) => keys().filter((k) => k.startsWith(d.replace(/\/$/, '') + '/'));
  return {
    has: (p) => p in files || under(p).length > 0,
    read: (p) => { if (!(p in files)) throw new Error(`없는 파일 ${p}`); return files[p]; },
    ls: (d) => [...new Set(under(d).map((k) => k.slice(d.length + 1).split('/')[0]))],
    isDir: (d) => under(d).length > 0,
    lineOf: (t, n) => { const i = t.indexOf(n); return i < 0 ? null : t.slice(0, i).split('\n').length; },
  };
}
const md = (...lines) => lines.join('\n') + '\n';
const README = md('# 시스템 그림', '', '```mermaid', 'flowchart LR', '  subgraph browser["브라우저"]', '    web["웹 화면"]', '  end', '  subgraph server["서버"]', '    bff["BFF"]', '    db["DB"]', '  end', '  subgraph outside["바깥"]', '    auth["로그인 제공자"]', '  end', '  web --> bff', '  bff --> db', '  bff --> auth', '```', '',
  '| 부품 | 파일 | 이름 | 종류 |', '|---|---|---|---|', '| web | [web.md](web.md) | 웹 화면 | 우리 코드 |', '| bff | [bff.md](bff.md) | BFF | 우리 코드 |', '| db | [db.md](db.md) | DB | 우리 코드 |', '| auth | [auth.md](auth.md) | 로그인 제공자 | 바깥 상대 |');
const WEB = (allowPages = 'lib, mock', extra = '') => md('# 웹 화면', '', '브라우저 화면 전부.', '', '- id: web', '- 폴더: web/src', '',
  '## 층: 화면', '', '라우트 페이지.', '', '- id: pages', '- 폴더: web/src/pages', `- 가져올 수 있는 층: ${allowPages}`, '',
  '## 층: 자료 받기', '', 'BFF 호출.', '', '- id: lib', '- 폴더: web/src/lib', '- 가져올 수 있는 층: —', '',
  '## 층: 목업', '', '고정 자료.', '', '- id: mock', '- 폴더: web/src/mock', '- 가져올 수 있는 층: lib', '',
  '## 흐름: 동작 장면', '', '사용자가 동작 화면을 본다.', '', '- id: live-flow', '- 단계: j1/s1',
  '- 지나는 곳: 화면 /live → 함수 web/src/pages/Live.tsx:Live → API GET /api/resorts → DB 함수 list_resorts → 테이블 app.resorts', extra);
const BFF = md('# BFF', '', '중간 서버.', '', '- id: bff', '- 폴더: app');
const DB = md('# DB', '', 'migration 정본.', '', '- id: db', '- 폴더: supabase/migrations');
const AUTH = md('# 로그인 제공자', '', '외부 인증.', '', '- id: auth', '- 스키마: auth');
const DECL = { [`${DIR}/README.md`]: README, [`${DIR}/web.md`]: WEB(), [`${DIR}/bff.md`]: BFF, [`${DIR}/db.md`]: DB, [`${DIR}/auth.md`]: AUTH };
// 저장소 파일(폴더 존재 판정용)
const REPO = { 'web/src/App.tsx': '', 'web/src/pages/Live.tsx': '', 'web/src/pages/Mocked.tsx': '', 'web/src/lib/queries.ts': '', 'web/src/mock/index.ts': '', 'app/server.mjs': '', 'supabase/migrations/20260101000000_init.sql': '' };

// graphify 어댑터·다리가 만든 뒤의 그래프 모양을 직접 만든다
function graph({ typeOnly = false, deferred = false, inferredOnly = false } = {}) {
  const g = new Graph();
  const mod = (path, community, name) => g.add('module', path, path.split('/').pop(), { graphifyId: path, community, communityName: name }, { file: path, line: 1, rule: 'graphify:file' });
  const sym = (path, name, community) => { g.add('symbol', `${path}:${name}`, name, { module: path, line: 3, callable: true, class: false, graphifyId: `${path}:${name}`, community, communityName: 'c' }); g.link('module', path, 'contains', 'symbol', `${path}:${name}`, { confidence: 'EXTRACTED' }); };
  for (const f of ['web/src/App.tsx', 'web/src/pages/Live.tsx', 'web/src/pages/Mocked.tsx', 'web/src/lib/queries.ts']) mod(f, 1, 'App.tsx');
  mod('web/src/mock/index.ts', 2, 'index.ts');
  mod('app/server.mjs', 3, 'server.mjs');
  mod('supabase/migrations/20260101000000_init.sql', 4, 'init.sql');
  g.add('module', 'react', 'react', { external: true, graphifyId: 'ref_react', community: 1, communityName: 'App.tsx' }, null);
  sym('web/src/pages/Live.tsx', 'Live', 1); sym('web/src/lib/queries.ts', 'useResorts', 1); sym('app/server.mjs', 'handle', 3);
  const imp = (a, b, props = { confidence: 'EXTRACTED' }) => g.link('module', a, 'imports', 'module', b, props);
  imp('web/src/App.tsx', 'web/src/pages/Live.tsx'); imp('web/src/App.tsx', 'web/src/pages/Mocked.tsx'); imp('web/src/App.tsx', 'react');
  imp('web/src/pages/Live.tsx', 'web/src/lib/queries.ts'); imp('web/src/pages/Mocked.tsx', 'web/src/mock/index.ts');
  // 규칙 위반 후보: lib → pages(허용 목록 —). typeOnly 면 위반이 아니고 deferred 는 결정 전 취급
  imp('web/src/lib/queries.ts', 'web/src/pages/Live.tsx', { confidence: 'EXTRACTED', ...(typeOnly ? { typeOnly: true } : {}), ...(deferred ? { deferred: true } : {}) });
  g.link('symbol', 'web/src/pages/Live.tsx:Live', 'calls', 'symbol', 'web/src/lib/queries.ts:useResorts', { confidence: inferredOnly ? 'INFERRED' : 'EXTRACTED' });
  // livemap 노드와 다리
  g.add('screen', '/live', '/live', { file: 'web/src/pages/Live.tsx', source: 'live' }, { file: 'web/src/App.tsx', line: 6, rule: 'router:<Route path>' });
  g.add('screen', '/mocked', '/mocked', { file: 'web/src/pages/Mocked.tsx', source: 'mock' }, { file: 'web/src/App.tsx', line: 7, rule: 'router:<Route path>' });
  g.add('api', '/api/resorts', 'GET /api/resorts', { method: 'GET', calls: ['list_resorts'] }, { file: 'app/server.mjs', line: 2, rule: 'bff:route()' });
  g.add('api', '/api/login', 'POST /api/login', { method: 'POST', calls: ['auth:token'] }, { file: 'app/server.mjs', line: 5, rule: 'bff:route()' });
  g.add('function', 'list_resorts', 'list_resorts', { qualified: 'app.list_resorts', schema: 'app', graphifyIds: ['x'], community: 4, communityName: 'init.sql' }, { file: 'supabase/migrations/20260101000000_init.sql', line: 3, rule: 'migrations:create function' });
  g.add('table', 'app.resorts', 'resorts', { schema: 'app', graphifyIds: ['y'], community: 4, communityName: 'init.sql' }, { file: 'supabase/migrations/20260101000000_init.sql', line: 1, rule: 'migrations:create table' });
  g.add('table', 'app.items', 'items', { schema: 'app' }, { file: 'supabase/migrations/20260101000000_init.sql', line: 9, rule: 'migrations:create table' });
  g.add('symbol', 'auth.users', 'auth.users', { external: true, sql: true, schema: 'auth', graphifyIds: ['z'], community: null, communityName: null }, null);
  g.add('auth', 'auth:token', 'auth:token', { external: true, auth: true, provider: 'token' }, null);
  g.link('screen', '/live', 'renders', 'module', 'web/src/pages/Live.tsx', { bridge: true });
  g.link('screen', '/mocked', 'renders', 'module', 'web/src/pages/Mocked.tsx', { bridge: true });
  g.link('api', '/api/resorts', 'defined_in', 'module', 'app/server.mjs', { bridge: true });
  g.link('api', '/api/login', 'defined_in', 'module', 'app/server.mjs', { bridge: true });
  g.link('screen', '/live', 'calls', 'api', '/api/resorts');
  g.link('api', '/api/resorts', 'invokes', 'function', 'list_resorts');
  g.link('api', '/api/login', 'invokes', 'auth', 'auth:token', { bridge: true });
  g.link('function', 'list_resorts', 'touches', 'table', 'app.resorts');
  g.link('function', 'list_resorts', 'touches', 'table', 'app.items');
  g.link('function', 'list_resorts', 'reads', 'symbol', 'auth.users', { confidence: 'EXTRACTED' });
  g.architecture = { graphMissing: false, graphify: { nodes: 9, edges: 9 }, bridges: { made: 4, moved: 4 } };
  return g;
}
const SEM = { journeys: [{ id: 'j1', title: '여정 하나', steps: [{ id: 's1', label: '동작 장면', status: 'live', screens: ['/live'], apis: [] }] }] };
const cfg = (over = {}) => ({ architecture: { dir: DIR, graph: 'graphify-out/graph.json', ...over } });
const run = (files = DECL, g = graph(), c = cfg()) => architectureStage(g, fakeFs({ ...REPO, ...files }), c, SEM);
const codes = (g, code) => g.issues.filter((i) => i.code === code);

test('SC-5 읽개: README 표와 그림, 부품 파일의 머리 속성·층·흐름·바깥 상대 스키마를 읽는다. 지나는 곳은 종류 낱말 여섯', () => {
  const d = readArchitectureDir(fakeFs({ ...REPO, ...DECL }), DIR);
  assert.deepEqual(d.problems, []);
  assert.equal(d.diagram.ok, true);
  assert.deepEqual(d.containers.map((c) => [c.id, c.kind, c.file, c.dirs, c.schemas, c.boundary]), [
    ['web', 'ours', `${DIR}/web.md`, ['web/src'], [], 'browser'], ['bff', 'ours', `${DIR}/bff.md`, ['app'], [], 'server'], ['db', 'ours', `${DIR}/db.md`, ['supabase/migrations'], [], 'server'], ['auth', 'external', `${DIR}/auth.md`, [], ['auth'], 'outside'],
  ]);
  const web = d.containers[0];
  assert.deepEqual(web.lanes.map((l) => [l.id, l.name, l.dirs, l.allow]), [['pages', '화면', ['web/src/pages'], ['lib', 'mock']], ['lib', '자료 받기', ['web/src/lib'], []], ['mock', '목업', ['web/src/mock'], ['lib']]]);
  assert.equal(web.prose, '브라우저 화면 전부.');
  assert.deepEqual(web.flows.map((f) => [f.id, f.name, f.step, f.path]), [['live-flow', '동작 장면', 'j1/s1', [
    { kind: 'screen', ref: '/live' }, { kind: 'symbol', ref: 'web/src/pages/Live.tsx:Live' }, { kind: 'api', ref: 'GET /api/resorts' }, { kind: 'function', ref: 'list_resorts' }, { kind: 'table', ref: 'app.resorts' },
  ]]]);
  assert.deepEqual(d.links, [{ from: 'web', to: 'bff' }, { from: 'bff', to: 'db' }, { from: 'bff', to: 'auth' }]);
  assert.deepEqual(parsePath('파일 web/src/a.ts -> 함수 web/src/a.ts:f → 모름 x'), { path: [{ kind: 'module', ref: 'web/src/a.ts' }, { kind: 'symbol', ref: 'web/src/a.ts:f' }], bad: ['모름 x'] });
  // 허용 목록 줄이 없는 층은 규칙 없음(null)이고 — 는 빈 목록
  const d2 = readArchitectureDir(fakeFs({ ...REPO, ...DECL, [`${DIR}/web.md`]: md('# 웹', '- id: web', '- 폴더: web/src', '## 층: 화면', '- id: pages', '- 폴더: web/src/pages') }), DIR);
  assert.equal(d2.containers[0].lanes[0].allow, null);
});

test('SC-5 읽개 문제: 그림을 못 읽으면 architecture.diagram-unreadable, 부품·층·흐름 id 가 겹치면 architecture.duplicate-id', () => {
  const noDiagram = readArchitectureDir(fakeFs({ ...REPO, ...DECL, [`${DIR}/README.md`]: README.replace('flowchart LR', 'graph LR') }), DIR);
  assert.deepEqual(noDiagram.problems.map((p) => p.code), ['architecture.diagram-unreadable']);
  assert.equal(noDiagram.containers.length, 4, '표는 그대로 읽는다');
  const dup = readArchitectureDir(fakeFs({ ...REPO, ...DECL, [`${DIR}/bff.md`]: md('# BFF', '- id: web', '- 폴더: app'), [`${DIR}/web.md`]: WEB('lib, mock', md('', '## 층: 또 화면', '- id: pages', '- 폴더: web/src/x')) }), DIR);
  assert.deepEqual(dup.problems.map((p) => [p.code, p.message.includes('web') || p.message.includes('pages')]), [['architecture.duplicate-id', true], ['architecture.duplicate-id', true]]);
  const laneAsKind = readArchitectureDir(fakeFs({ ...REPO, ...DECL, [`${DIR}/web.md`]: WEB().replace('- id: pages', '- id: screen') }), DIR);
  assert.deepEqual(laneAsKind.problems.map((p) => p.code), ['architecture.duplicate-id'], '층 id 는 노드 종류 이름(screen·api·function·table·auth)과 겹칠 수 없다');
});

test('SC-12 층 위반: 허용 목록에 없는 층에서 가져오면 architecture.layer-violation(파일·줄 근거). 타입 전용 링크는 위반이 아니다(DEC-15)', () => {
  const g = graph();
  const r = run(DECL, g);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.violations.map((v) => [v.from, v.to, v.fromLane, v.toLane]), [['web/src/lib/queries.ts', 'web/src/pages/Live.tsx', 'lib', 'pages']]);
  const issues = codes(g, 'architecture.layer-violation');
  assert.equal(issues.length, 1);
  assert.deepEqual([issues[0].level, issues[0].subject, issues[0].anchors], ['warn', { kind: 'module', id: 'web/src/lib/queries.ts' }, [{ file: 'web/src/lib/queries.ts', line: null }]]);
  assert.match(issues[0].message, /lib.*pages/);
  const t = graph({ typeOnly: true });
  run(DECL, t);
  assert.deepEqual(codes(t, 'architecture.layer-violation'), []);
  // OQ10_DECISION=C: 동적 import(deferred)는 위반으로 세되 문구에 '동적 import' 를 표시하고 위반 항목에 deferred 가 남는다. 설정 deferred: 'ignore' 면 타입 전용처럼 뺀다
  const d = graph({ deferred: true });
  const rd = run(DECL, d);
  assert.deepEqual(rd.violations.map((v) => [v.from, v.deferred]), [['web/src/lib/queries.ts', true]]);
  assert.match(codes(d, 'architecture.layer-violation')[0].message, /\[동적 import\]/);
  assert.equal(rd.deferredPolicy, 'count');
  const di = graph({ deferred: true });
  run(DECL, di, cfg({ deferred: 'ignore' }));
  assert.deepEqual(codes(di, 'architecture.layer-violation'), []);
  // 같은 층 안 import 와 규칙 없는 층(allow null)은 판정하지 않는다
  const free = graph();
  run({ ...DECL, [`${DIR}/web.md`]: WEB().replace('- 가져올 수 있는 층: —', '') }, free);
  assert.deepEqual(codes(free, 'architecture.layer-violation'), []);
});

test('SC-12 허용 목록을 모두 비우면 층 사이 import 마다 위반이고 modules[].violations·laneLinks 에 실린다', () => {
  const g = graph({ typeOnly: true }); // lib → pages 는 타입 전용이라 빠진다
  const r = run({ ...DECL, [`${DIR}/web.md`]: WEB('—') }, g);
  assert.deepEqual(r.violations.map((v) => `${v.fromLane} → ${v.toLane}`), ['pages → lib', 'pages → mock']);
  assert.deepEqual(r.modules.find((m) => m.id === 'web/src/pages/Live.tsx').violations, ['web/src/lib/queries.ts']);
  assert.deepEqual(r.laneLinks.filter((l) => ['pages', 'lib', 'mock'].includes(l.from)).map((l) => `${l.from}→${l.to}:${l.n}`).sort(), ['lib→pages:1', 'pages→lib:1', 'pages→mock:1']);
});

test('SC-12 배정: 부품 폴더로 부품, 층 폴더로 층. 겹치면 가장 깊은 선언이 이기고 같은 깊이는 architecture.duplicate-id 오류. 어느 부품에도 없는 파일은 architecture.module-unassigned', () => {
  const g = graph();
  g.add('module', 'tests/api.test.mjs', 'api.test.mjs', { graphifyId: 't', community: 5, communityName: 't' }, { file: 'tests/api.test.mjs', line: 1, rule: 'graphify:file' });
  const r = run(DECL, g);
  const byId = Object.fromEntries(r.modules.map((m) => [m.id, m]));
  assert.deepEqual([byId['web/src/App.tsx'].container, byId['web/src/App.tsx'].lane], ['web', null], '부품 폴더 안이지만 층 폴더 밖이면 층 없음(경고 아님)');
  assert.deepEqual([byId['web/src/pages/Live.tsx'].container, byId['web/src/pages/Live.tsx'].lane], ['web', 'pages']);
  assert.deepEqual([byId['app/server.mjs'].container, byId['supabase/migrations/20260101000000_init.sql'].container], ['bff', 'db']);
  assert.deepEqual([byId['tests/api.test.mjs'].container, byId['tests/api.test.mjs'].lane], [null, null]);
  assert.equal(r.modules.some((m) => m.id === 'react'), false, '외부 module 은 배정 대상이 아니다');
  assert.deepEqual(codes(g, 'architecture.module-unassigned').map((i) => i.subject.id), ['tests/api.test.mjs']);
  // 깊은 선언이 이긴다: bff 폴더를 web/src/pages 로 두면 pages 파일은 bff 가 아니라… 더 깊은 쪽(web/src/pages 가 web/src 보다 깊음)이 이겨 bff 로 간다
  const deep = graph();
  run({ ...DECL, [`${DIR}/bff.md`]: md('# BFF', '- id: bff', '- 폴더: app, web/src/pages') }, deep);
  assert.equal(deep.architecture.stage.modules.find((m) => m.id === 'web/src/pages/Live.tsx').container, 'bff');
  assert.deepEqual(codes(deep, 'architecture.duplicate-id'), []);
  const same = graph();
  run({ ...DECL, [`${DIR}/bff.md`]: md('# BFF', '- id: bff', '- 폴더: app, web/src') }, same);
  assert.ok(codes(same, 'architecture.duplicate-id').length >= 1, '같은 깊이 겹침은 id 중복과 같은 급');
});

test('SC-12 층·부품 선언 문제: 노드 0인 층은 architecture.lane-empty, 저장소에 없는 부품 폴더는 architecture.container-unanchored, 그림에만 있는 부품은 architecture.container-undeclared', () => {
  const g = graph();
  run({ ...DECL, [`${DIR}/web.md`]: WEB('lib, mock', md('', '## 층: 빈 층', '- id: empty', '- 폴더: web/src/nowhere')), [`${DIR}/db.md`]: md('# DB', '- id: db', '- 폴더: database/migrations'), [`${DIR}/README.md`]: README.replace('  bff --> db', '  bff --> db\n  bff --> cache["캐시"]') }, g);
  assert.deepEqual(codes(g, 'architecture.lane-empty').map((i) => i.subject), [{ kind: 'config', id: 'architecture.lane.empty' }]);
  assert.deepEqual(codes(g, 'architecture.container-unanchored').map((i) => [i.subject.id, i.message.includes('database/migrations')]), [['db', true]]);
  assert.deepEqual(codes(g, 'architecture.container-undeclared').map((i) => i.subject.id), ['cache']);
});

test('SC-12 바깥 상대: 스키마 단위 선언(- 스키마: auth)에 바깥 상대 SQL 노드가 묶이고, 선언 없는 스키마는 architecture.external-undeclared', () => {
  const g = graph();
  const r = run(DECL, g);
  assert.deepEqual(codes(g, 'architecture.external-undeclared'), []);
  assert.deepEqual(r.containers.find((c) => c.id === 'auth').externals, ['symbol:auth.users']);
  assert.ok(g.edges.some((e) => e.from === 'container:auth' && e.kind === 'contains' && e.to === 'symbol:auth.users'));
  const g2 = graph();
  run({ ...DECL, [`${DIR}/auth.md`]: md('# 로그인 제공자', '- id: auth') }, g2);
  assert.deepEqual(codes(g2, 'architecture.external-undeclared').map((i) => [i.subject, i.message.includes('auth')]), [[{ kind: 'config', id: 'architecture.external.auth' }, true]]);
  // 로그인 노드(auth:token)는 바깥 상대 선언을 요구하지 않는다(선언 초안 결정)
  assert.equal(codes(g2, 'architecture.external-undeclared').length, 1);
});

test('SC-22 물려받기: 화면은 renders 대상 파일, API 는 defined_in 대상 파일의 묶음을 받는다(invokes 를 먼저 쓰지 않는다). 로그인·livemap 만 아는 테이블·바깥 상대는 묶음 없음', () => {
  const g = graph();
  const r = run(DECL, g);
  assert.deepEqual([g.get('screen', '/live').props.community, g.get('screen', '/mocked').props.community, g.get('api', '/api/resorts').props.community, g.get('api', '/api/login').props.community], [1, 1, 3, 3]);
  assert.equal(g.get('api', '/api/resorts').props.communityInherited, true);
  assert.deepEqual([g.get('auth', 'auth:token').props.community, g.get('table', 'app.items').props.community, g.get('symbol', 'auth.users').props.community], [undefined, undefined, null]);
  assert.equal(r.inherited, 4);
  const c1 = r.communities.find((c) => c.id === 1);
  assert.deepEqual([c1.name, c1.nodes, c1.inherited, c1.lanes], ['App.tsx', 4, 2, ['pages', 'lib']]);
  // 묶음 사이 선: 물려받은 화면(묶음 1) → API(묶음 3) calls 가 웹 ↔ BFF 선이 된다
  assert.deepEqual(r.communityLinks.find((l) => l.from === 1 && l.to === 3), { from: 1, to: 3, n: 1, kinds: { calls: 1 } });
  assert.deepEqual(r.communityLinks.find((l) => l.from === 3 && l.to === 4), { from: 3, to: 4, n: 1, kinds: { invokes: 1 } });
});

test('SC-22 묶음 구역(zone)은 community_name 규칙 설정으로 정하고, 규칙이 없으면 파일이 가장 많은 부품이다', () => {
  const g = graph();
  const r = run(DECL, g, cfg({ zones: [['\\.tsx?$', 'web'], ['\\.sql$', 'db'], ['\\.mjs$', 'bff']] }));
  assert.deepEqual(r.communities.map((c) => [c.id, c.zone]), [[1, 'web'], [2, 'web'], [3, 'bff'], [4, 'db']]);
  const g2 = graph();
  const r2 = run(DECL, g2);
  assert.deepEqual(r2.communities.map((c) => [c.id, c.zone]), [[1, 'web'], [2, 'web'], [3, 'bff'], [4, 'db']]);
});

test('SC-6 층 목록: 선언한 층은 파일 수, 화면·API·DB 함수·테이블·로그인은 종류 층으로 세고, 층 없는 부품은 부품 하나가 층 하나다', () => {
  const r = run();
  assert.deepEqual(r.lanes.map((l) => [l.id, l.container, l.kind, l.nodes]), [
    ['pages', 'web', 'code', 2], ['lib', 'web', 'code', 1], ['mock', 'web', 'code', 1], ['screen', 'web', 'screen', 2],
    ['bff', 'bff', 'code', 1], ['api', 'bff', 'api', 2],
    ['db', 'db', 'code', 1], ['function', 'db', 'function', 1], ['table', 'db', 'table', 2],
    ['auth', null, 'auth', 1],
  ]);
  assert.ok(r.lanes.every((l) => l.visible === true));
  assert.deepEqual(r.laneLinks.filter((l) => !['pages', 'lib', 'mock'].includes(l.from)).map((l) => `${l.from}→${l.to}:${l.n}`).sort(), ['api→auth:1', 'api→function:1', 'function→table:2', 'screen→api:1']);
});

test('SC-7 흐름: 단계와 좌표를 풀어 nodes·counts·status 를 만들고, 좌표가 없으면 architecture.flow-step-missing 오류', () => {
  const g = graph();
  const r = run(DECL, g);
  const f = r.flows[0];
  assert.deepEqual([f.id, f.name, f.status, f.step, f.broken], ['live-flow', '동작 장면', 'live', 'j1/s1', []]);
  assert.deepEqual(f.counts, { screen: 1, file: 1, api: 1, auth: 0, fn: 1, table: 2 });
  assert.deepEqual(f.nodes, ['screen:/live', 'module:web/src/pages/Live.tsx', 'api:/api/resorts', 'function:list_resorts', 'table:app.items', 'table:app.resorts']);
  assert.deepEqual(f.path.map((p) => p.node), ['screen:/live', 'symbol:web/src/pages/Live.tsx:Live', 'api:/api/resorts', 'function:list_resorts', 'table:app.resorts']);
  assert.ok(g.get('flow', 'live-flow'));
  assert.equal(g.edges.filter((e) => e.from === 'flow:live-flow' && e.kind === 'contains').length, 5);
  assert.deepEqual(codes(g, 'architecture.flow-step-missing'), []);
  // 호출 가능한 심볼은 Graphify 라벨에 () 가 붙는다. 선언이 () 없이 적어도 맞춘다
  const g3 = graph();
  g3.add('symbol', 'web/src/pages/Live.tsx:load()', 'load()', { module: 'web/src/pages/Live.tsx', line: 7, callable: true, class: false, graphifyId: 'l', community: 1, communityName: 'App.tsx' });
  g3.link('symbol', 'web/src/pages/Live.tsx:Live', 'calls', 'symbol', 'web/src/pages/Live.tsx:load()', { confidence: 'EXTRACTED' });
  run({ ...DECL, [`${DIR}/web.md`]: WEB().replace('함수 web/src/pages/Live.tsx:Live → API', '함수 web/src/pages/Live.tsx:Live → 함수 web/src/pages/Live.tsx:load → API') }, g3);
  assert.deepEqual(codes(g3, 'architecture.flow-step-missing'), []);
  assert.equal(g3.architecture.stage.flows[0].path[2].node, 'symbol:web/src/pages/Live.tsx:load()');
  const g2 = graph();
  run({ ...DECL, [`${DIR}/web.md`]: WEB().replace('- 단계: j1/s1', '- 단계: j1/zz').replace('테이블 app.resorts', '테이블 app.nope') }, g2);
  assert.deepEqual(codes(g2, 'architecture.flow-step-missing').map((i) => [i.level, i.subject.id]), [['error', 'live-flow'], ['error', 'live-flow']]);
});

test('SC-14 끊김: 이어진 두 좌표 사이에 엣지가 없거나 추정(INFERRED) 엣지뿐이면 architecture.flow-broken 경고이고 판정(judge)으로 채울 수 있다', () => {
  const g = graph({ inferredOnly: true });
  g.edges.splice(g.edges.findIndex((e) => e.from === 'screen:/live' && e.kind === 'calls'), 1); // 화면 → API 사슬을 끊는다
  const r = run(DECL, g);
  const f = r.flows[0];
  assert.deepEqual(f.broken.map((b) => [b.from, b.to, b.reason]), [['symbol:web/src/pages/Live.tsx:Live', 'api:/api/resorts', 'no-edge']]);
  const issues = codes(g, 'architecture.flow-broken');
  assert.deepEqual([issues.length, issues[0].level, issues[0].subject, issues[0].resolutions], [1, 'warn', { kind: 'flow', id: 'live-flow' }, ['source', 'code', 'judge']]);
  // 추정 엣지뿐인 구간: 함수 → 함수 호출이 INFERRED 만 있으면 끊김(reason inferred)
  const g2 = graph({ inferredOnly: true });
  run({ ...DECL, [`${DIR}/web.md`]: WEB().replace('함수 web/src/pages/Live.tsx:Live → API', '함수 web/src/pages/Live.tsx:Live → 함수 web/src/lib/queries.ts:useResorts → API') }, g2);
  // useResorts → API 구간은 어느 엣지도 없어 no-edge 다
  assert.deepEqual(g2.architecture.stage.flows[0].broken.map((b) => b.reason), ['inferred', 'no-edge']);
});

test('SC-5 부품 사이 depends: 그림의 선(declared)과 실측 엣지(measured)의 합집합', () => {
  const g = graph();
  const r = run(DECL, g);
  const deps = g.edges.filter((e) => e.kind === 'depends').map((e) => [e.from, e.to, e.props]);
  assert.deepEqual(deps, [
    ['container:web', 'container:bff', { declared: true, measured: 1 }],
    ['container:bff', 'container:db', { declared: true, measured: 1 }],
    ['container:bff', 'container:auth', { declared: true, measured: 0 }],
    ['container:db', 'container:auth', { declared: false, measured: 1 }],
  ]);
  assert.deepEqual(r.containers.map((c) => [c.id, c.deps]), [['web', ['bff']], ['bff', ['db', 'auth']], ['db', ['auth']], ['auth', []]]);
  assert.deepEqual(r.containers[0].counts, { screens: 2, files: 5, symbols: 2, mocks: 1 });
});

test('SC-4 설정 architecture.dir 이 없거나 폴더가 없으면 partial 이고 조용히 통과하지 않는다. graphify 어댑터가 돌지 않았어도 선언은 대조한다', () => {
  const g = graph();
  const none = architectureStage(g, fakeFs(REPO), {}, SEM);
  assert.deepEqual([none.status, g.architecture.stage.status], ['partial', 'partial']);
  assert.match(none.error, /architecture\.dir/);
  const g2 = graph();
  const missing = architectureStage(g2, fakeFs(REPO), cfg(), SEM);
  assert.equal(missing.status, 'partial');
  assert.match(missing.error, /map\/architecture/);
  const g3 = new Graph();
  g3.add('screen', '/live', '/live', { file: 'web/src/pages/Live.tsx' }, null);
  const r3 = architectureStage(g3, fakeFs({ ...REPO, ...DECL }), cfg(), SEM);
  assert.equal(r3.status, 'ok');
  assert.equal(r3.containers.length, 4);
});
