// 어댑터 단위 검사: 작은 고정 저장소(fixtures/mini)에 대해 기대한 노드·엣지·검증 결과가 나오는지 본다.
// 스캐너 정규식이 깨지면 여기서 먼저 실패한다(빈 표를 "없음"으로 오해하지 않기 위한 첫 방어선).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/cli.mjs';
import { check } from '../src/check.mjs';
import { overviewSlice } from '../src/derive.mjs';

const MINI = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/mini');
const { g, data, cfg } = await buildGraph(MINI);

test('router: 라우트 2개, 출처 분류, 레이아웃·catch-all 제외, 이름 붙은 가드(adminGuard)도 가드로 읽음', () => {
  const s = g.of('screen').map((x) => [x.id, x.props.source, x.props.guarded]);
  assert.deepEqual(s, [['/live', 'live', false], ['/mocked', 'mock', true]]);
  assert.equal(g.get('screen', '/live').src.file, 'web/src/App.tsx');
});

test('bff: API 3개(분기 2·라우트 목록 1), rpc·rpcCall·auth 호출 분리, 블록 경계가 새지 않음', () => {
  const a = Object.fromEntries(g.of('api').map((x) => [x.id, x.props.calls]));
  assert.deepEqual(a, { '/api/resorts': ['list_resorts'], '/api/login': ['auth:token'], '/api/items/:id': ['get_item'] });
  assert.deepEqual(g.out('api', '/api/resorts', 'invokes').map((n) => n.id), ['list_resorts']);
});

test('migrations: 테이블·함수·RLS, 함수→테이블 touches', () => {
  assert.deepEqual(g.of('table').map((t) => t.id), ['app.resorts']);
  assert.deepEqual(g.out('function', 'list_resorts', 'touches').map((t) => t.id), ['app.resorts']);
  assert.equal(g.of('migration')[0].props.rls, 1);
  assert.equal(g.of('migration')[0].props.grants, 1);
});

test('tests: API 문자열과 rpc 호출로 covers 엣지', () => {
  assert.deepEqual(g.out('test', 'tests/api.test.mjs', 'covers').map((n) => n.kind + ':' + n.id).sort(), ['api:/api/resorts', 'function:list_resorts']);
});

test('tasks: 단계·상태·DEC·PN·OQ, 장부 행', () => {
  const t = g.get('task', '20260101-sample').props;
  assert.equal(t.stage, '계획');
  assert.equal(t.status, '진행');
  // 계획 항목은 계획 문서에서만, 결정·열린 질문은 spec/final.md에서만 센다. 스펙에 적은 계획 초안 체크박스와 계획 문서에 옮겨 적은 결정·질문은 세지 않는다.
  assert.deepEqual([t.dec, t.pnDone, t.pnOpen, t.oq], [1, 1, 1, 1]);
  assert.equal(g.get('decision', 'PN-01').props.file, 'tasks/20260101-sample/plan.md');
  assert.equal(g.get('decision', 'DEC-01').props.file, 'tasks/20260101-sample/spec/final.md');
  assert.equal(g.of('ledger').filter((l) => l.props.state === 'running').length, 1);
  assert.equal(g.in('decision', 'DEC-01', 'defines')[0].id, '20260101-sample');
});

test('wiki: 결정 노드와 상태', () => {
  assert.equal(g.get('decision', 'sample').props.status, 'current');
});

test('git·deploy: 저장소가 아니면 partial로 보고하고 생성은 계속된다', () => {
  const st = Object.fromEntries(data.adapters.map((a) => [a.name, a.status]));
  assert.equal(st.router, 'ok');
  assert.notEqual(st.git, 'failed');
  assert.notEqual(st.deploy, 'failed');
});

test('derive: 장면 해석·등급·참조·경고', () => {
  const [s1, s2, s3] = data.semantic.journeys[0].steps;
  assert.equal(s1.grade, 'B');
  assert.deepEqual(s1.refNodes.map((r) => r.task || (r.wiki && 'wiki') || null), ['20260101-sample', '20260101-sample', 'wiki']);
  assert.equal(s2.grade, null);
  assert.deepEqual(s3.warnings, ['라우트 없음: /nope']);
  assert.equal(data.semantic.journeys[0].status, 'partial');
});

test('router: 코드 고정 표시값은 출처 분류를 바꾸지 않고 따로 센다', () => {
  assert.equal(g.get('screen', '/live').props.source, 'live');
  assert.deepEqual(g.get('screen', '/live').props.fixedVia, ['pages/Live.tsx']);
  assert.equal(data.summary.fixedRoutes, 1);
});

test('roadmap: 순서·속성·장면 진척, 없는 장면·작업·선행·상태 어휘는 오류', () => {
  const [first, second] = data.roadmap;
  assert.deepEqual([first.id, first.order, first.status, first.mode, first.goal, first.waitingOn], ['first', 1, '진행', '계획', '첫 목표 문장.', '고를 것']);
  assert.deepEqual(first.tasks.map((x) => x.name), ['20260101-sample']);
  assert.deepEqual(first.progress, { live: 1, total: 2, fixed: 1 });
  assert.deepEqual(first.problems, []);
  assert.deepEqual(second.problems, ['장면 없음: j1/zz', '작업 폴더 없음: 20269999-none', '선행 항목 없음: ghost', '알 수 없는 상태: 모름']);
  const errors = check(data, cfg).filter((p) => p.level === 'error' && /^로드맵/.test(p.msg));
  assert.equal(errors.length, 4);
  assert.equal(overviewSlice(data).roadmap.length, 2);
});

test('check: 라우트 없음은 오류, 고아는 경고, 바닥값 미달은 오류', () => {
  const problems = check(data, cfg);
  assert.ok(problems.some((p) => p.level === 'error' && /라우트 없음/.test(p.msg)));
  assert.ok(problems.some((p) => p.level === 'warn' && /부르지 않는 API/.test(p.msg)));
  const strict = check(data, { ...cfg, floors: { screen: 99 } });
  assert.ok(strict.some((p) => p.level === 'error' && /바닥값 미달 screen/.test(p.msg)));
});

test('graphify·architecture(2.1.0): mini 에 Graphify 그래프와 선언(부품 web·bff·db, 바깥 상대 auth, 층 셋, 흐름 하나)이 있고 깨끗한 상태에서 위반 0·끊김 0', () => {
  const st = Object.fromEntries(data.adapters.map((a) => [a.name, a.status]));
  assert.equal(st.graphify, 'ok');
  const a = data.architecture;
  assert.deepEqual(a.containers.map((c) => [c.id, c.kind]), [['web', 'ours'], ['bff', 'ours'], ['db', 'ours'], ['auth', 'external']]);
  assert.deepEqual(a.containers[0].counts.screens, 2);
  assert.deepEqual(a.lanes.filter((l) => l.kind === 'code' && l.container === 'web').map((l) => [l.id, l.count]), [['pages', 2], ['lib', 1], ['mock', 1]]);
  assert.ok(a.laneLinks.some((l) => l.from === 'pages' && l.to === 'lib'), '층 사이 import 가 최소 1건');
  assert.deepEqual(a.violations, []);
  assert.deepEqual(a.flows.map((f) => [f.id, f.status, f.broken]), [['live-flow', 'live', []]]);
  assert.ok(a.modules.length >= 7);
  assert.ok(a.communities.length >= 2);
  assert.deepEqual(a.bridges.unmatched, { livemapOnly: 0, unreached: 0 });
  assert.equal(a.graphify.unknownRelations && typeof a.graphify.nodes, 'number');
  assert.deepEqual([data.summary.containers, data.summary.flows, data.summary.boundaryViolations], [4, 1, 0]);
  assert.equal(data.summary.modules, a.modules.length);
  assert.equal(data.summary.communities, a.communities.length);
  // 합치기: 같은 SQL 라벨 노드 둘이 function·table 하나에 graphifyIds 로 붙는다
  assert.equal(g.get('table', 'app.resorts').props.graphifyIds.length, 2);
  assert.equal(g.of('function').length, 2, '2.0.2 함수 수 그대로(list_resorts·get_item)');
});

test('P3-14a SC-7·SC-6: flows[].edges 는 길 위 노드 사이 실측 엣지, lanes[].nodes 는 층에 선 노드 목록(화면·API·로그인·DB 함수·테이블 층이 비지 않는다)', () => {
  const a = data.architecture;
  const f = a.flows[0];
  assert.deepEqual(f.edges, [
    { from: 'api:/api/resorts', to: 'function:list_resorts', kind: 'invokes' },
    { from: 'function:list_resorts', to: 'table:app.resorts', kind: 'reads' },
    { from: 'function:list_resorts', to: 'table:app.resorts', kind: 'touches' },
    { from: 'screen:/live', to: 'api:/api/resorts', kind: 'calls' },
    { from: 'screen:/live', to: 'module:web/src/pages/Live.tsx', kind: 'renders' },
  ]);
  const lane = (id) => a.lanes.find((l) => l.id === id);
  assert.deepEqual(lane('screen').nodes, [{ id: '/live', kind: 'screen', label: '/live', community: 1, part: 'web' }, { id: '/mocked', kind: 'screen', label: '/mocked', community: 2, part: 'web' }]);
  assert.deepEqual(lane('api').nodes.map((n) => n.id), ['/api/items/:id', '/api/login', '/api/resorts']);
  assert.deepEqual(lane('function').nodes, [{ id: 'list_resorts', kind: 'function', label: 'list_resorts', community: 4, part: 'db' }]);
  assert.deepEqual(lane('table').nodes, [{ id: 'app.resorts', kind: 'table', label: 'resorts', community: 4, part: 'db' }]);
  assert.deepEqual(lane('auth').nodes, [{ id: 'auth:token', kind: 'auth', label: 'auth:token', community: null, part: null }]);
  for (const l of a.lanes) { assert.equal(l.nodes.length, l.count, l.id); for (const n of l.nodes) assert.deepEqual(Object.keys(n), ['id', 'kind', 'label', 'community', 'part']); }
});
