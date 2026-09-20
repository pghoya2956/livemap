// 화면 순수 함수 검사(스펙 「테스트 계획」 화면 순수 함수): 신선도, 결정 대기 경과일, 시각 표기, 호스트 이름, 목록 맞춤,
// 기능 지도 12개 고르기, 마지막 방문 비교, 해시 라우트, 로드맵 트리 배치, 캡처 패널 범위, 구조 화면 배치. JSX 없는 ui/lib 모듈만 import한다
// (트리 검사의 픽스처 자료만 엔진 빌드로 만든다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshness, waitDays, hm, mdKo, kst, hostOf } from '../ui/lib/format.js';
import { fitCount, mapJourneys } from '../ui/lib/fit.js';
import { isNewer } from '../ui/lib/visit.js';
import { parseRoute, archHash, NAV } from '../ui/lib/route.js';
import { buildTree, pathOf, geometry, crossings } from '../ui/lib/tree.js';
import { visibleCaptures } from '../ui/lib/capture.js';
import { LANE_ORDER, laneLayout, communityLayout, flowPath, neighbors, foldByCommunity } from '../ui/lib/arch.js';

const G = '2026-09-16T17:29:52.070Z';
const plus = (min) => Date.parse(G) + min * 60000;

test('freshness: 15분 이하 LIVE, 넘으면 분·시간·일 전 자료', () => {
  assert.deepEqual(freshness(G, plus(14)), { live: true, label: 'LIVE' });
  assert.deepEqual(freshness(G, plus(15)), { live: true, label: 'LIVE' });
  assert.deepEqual(freshness(G, plus(16)), { live: false, label: '16분 전 자료' });
  assert.equal(freshness(G, plus(25 * 60)).label, '1일 전 자료');
  assert.equal(freshness(G, plus(90)).label, '2시간 전 자료');
});

test('waitDays: Asia/Seoul 날짜 차 + 1, 같은 날은 1일째', () => {
  assert.equal(waitDays('2026-09-17T00:10:00+09:00', '2026-09-17T23:50:00+09:00'), 1);
  assert.equal(waitDays('2026-09-15T12:43:09.000Z', G), 3);
  assert.equal(waitDays('2026-09-16T14:30:00Z', '2026-09-16T15:30:00Z'), 2); // UTC로는 같은 날, 서울로는 9.16 23:30과 9.17 00:30
});

test('시각 표기: 자정은 00:00, M월 D일, 1.0.1 kst 형식', () => {
  assert.equal(hm('2026-09-16T15:00:00Z'), '00:00');
  assert.equal(hm(G), '02:29');
  assert.equal(mdKo('2026-09-16T15:30:00Z'), '9월 17일');
  assert.equal(mdKo('2026-09-05'), '9월 5일');
  assert.equal(kst(G), '09. 17. 02:29');
  assert.equal(kst(null), '');
});

test('hostOf: 프로토콜 없음은 https, .invalid·빈 값·읽기 실패는 null', () => {
  assert.equal(hostOf('status.example.org').hostname, 'status.example.org');
  assert.equal(hostOf('http://a.example.com/x').href, 'http://a.example.com/x');
  assert.equal(hostOf('https://example.invalid'), null);
  assert.equal(hostOf(''), null);
  assert.equal(hostOf('http://[bad'), null);
});

test('fitCount: min(6, 항목 수, floor(높이 ÷ 행 높이))', () => {
  assert.equal(fitCount(200, 48, 20), 4);
  assert.equal(fitCount(1000, 30, 20), 6);
  assert.equal(fitCount(1000, 30, 2), 2);
  assert.equal(fitCount(29, 30, 5), 0);
  assert.equal(fitCount(-5, 30, 5), 0);
});

const J = (id, status, commits = 0, milestone = null) => ({ id, status, commits, milestone });
test('mapJourneys: 12개 이하는 그대로, 13개부터 미완성 → 현재 마일스톤 완성 → 나머지 완성(커밋 내림차순)', () => {
  for (const n of [9, 12]) {
    const js = Array.from({ length: n }, (_, i) => J(`j${i}`, 'live'));
    assert.deepEqual(mapJourneys(js), { shown: js, folded: 0, foldedIncomplete: false });
  }
  const j13 = [J('a', 'live', 1), J('b', 'mock'), J('c', 'live', 9), J('d', 'live', 5, { id: 'm1' }), ...Array.from({ length: 9 }, (_, i) => J(`x${i}`, 'live', 3))];
  const r13 = mapJourneys(j13, 'm1');
  assert.equal(r13.shown.length, 12);
  assert.equal(r13.folded, 1);
  assert.equal(r13.foldedIncomplete, false);
  assert.deepEqual(r13.shown.slice(0, 4).map((j) => j.id), ['b', 'c', 'd', 'x0']); // 파일 순서, 커밋 1인 a가 빠짐
  const j20 = Array.from({ length: 20 }, (_, i) => J(`k${i}`, i < 3 ? 'next' : 'live', i));
  const r20 = mapJourneys(j20);
  assert.equal(r20.folded, 8);
  assert.ok(['k0', 'k1', 'k2', 'k19', 'k12'].every((id) => r20.shown.some((j) => j.id === id)));
  assert.ok(!r20.shown.some((j) => j.id === 'k3'));
  const inc = Array.from({ length: 13 }, (_, i) => J(`m${i}`, 'partial'));
  const ri = mapJourneys([...inc, J('done', 'live', 50)]);
  assert.deepEqual(ri.shown.map((j) => j.id), inc.slice(0, 12).map((j) => j.id));
  assert.equal(ri.folded, 2);
  assert.equal(ri.foldedIncomplete, true);
});

test('마지막 방문 비교: Date.parse(+09:00이 Z보다 앞선 시각), 읽지 못하면 false', () => {
  assert.equal(isNewer('2026-09-17T01:33:48+09:00', '2026-09-16T20:00:00.000Z'), false);
  assert.ok('2026-09-17T01:33:48+09:00' > '2026-09-16T20:00:00.000Z'); // 문자열 비교는 틀린다
  assert.equal(isNewer('2026-09-16T20:00:00.000Z', '2026-09-17T01:33:48+09:00'), true);
  assert.equal(isNewer('2026-09-17T00:00:00Z', null), false);
  assert.equal(isNewer('bad', '2026-09-17T00:00:00Z'), false);
});

test('parseRoute: 1.0.1 라우트 패턴과 알 수 없는 경로', () => {
  const r = (h) => { const x = parseRoute(h); return [x.screen, x.nav, x.params]; };
  assert.deepEqual(r(''), ['overview', 0, {}]);
  assert.deepEqual(r('#/overview'), ['overview', 0, {}]);
  assert.deepEqual(r('#/journeys'), ['journeys', 1, { journey: null, step: null }]);
  assert.deepEqual(r('#/journeys/booking'), ['journeys', 1, { journey: 'booking', step: null }]);
  assert.deepEqual(r('#/journeys/booking/pay'), ['journeys', 1, { journey: 'booking', step: 'pay' }]);
  assert.deepEqual(r('#/roadmap'), ['roadmap', 3, { id: null }]);
  assert.deepEqual(r('#/roadmap/real-use-1'), ['roadmap', 3, { id: 'real-use-1' }]);
  assert.deepEqual(r('#/tasks'), ['tasks', 4, { task: null }]);
  assert.deepEqual(r('#/tasks/20260916-x'), ['tasks', 4, { task: '20260916-x' }]);
  assert.deepEqual(r('#/changes'), ['more', 5, { tab: 'changes', detail: null }]);
  assert.deepEqual(r('#/more'), ['more', 5, { tab: 'decisions', detail: null }]);
  for (const t of ['changes', 'decisions', 'screens', 'backend', 'tests', 'about']) assert.deepEqual(r(`#/more/${t}`), ['more', 5, { tab: t, detail: null }]);
  assert.deepEqual(r(`#/more/screens/${encodeURIComponent('/teams/:id')}`), ['more', 5, { tab: 'screens', detail: '/teams/:id' }]);
  for (const h of ['#/no-such-route', '#/more/nope', '#/journeys/a/b/c', '#/%E0%A4%A']) assert.deepEqual(r(h), ['overview', -1, {}]);
});

test('SC-9 parseRoute 구조 화면: 초점 여섯 단계와 기능·수준·나눔·보이기가 모두 해시에 실리고 archHash 가 되돌린다', () => {
  const r = (h) => { const x = parseRoute(h); return [x.screen, x.nav, x.params]; };
  assert.deepEqual(NAV, ['overview', 'journeys', 'architecture', 'roadmap', 'tasks', 'more']);
  const base = { focus: 'sys', flow: null, level: 'file', split: 'human', show: [] };
  assert.deepEqual(r('#/architecture'), ['architecture', 2, base]);
  assert.deepEqual(r('#/architecture/sys?split=code'), ['architecture', 2, { ...base, split: 'code' }]);
  assert.deepEqual(r(`#/architecture/${encodeURIComponent('part:web')}`), ['architecture', 2, { ...base, focus: 'part:web' }]);
  assert.deepEqual(r(`#/architecture/${encodeURIComponent('community:12')}/booking%2Fpay?level=fn`), ['architecture', 2, { ...base, focus: 'community:12', flow: 'booking/pay', level: 'fn' }]);
  assert.deepEqual(r(`#/architecture/${encodeURIComponent('web/src/pages/Pay.tsx')}?show=tests,libs`), ['architecture', 2, { ...base, focus: 'web/src/pages/Pay.tsx', show: ['tests', 'libs'] }]);
  // 모르는 값은 기본값으로 떨어지고 경로가 넷이면 알 수 없는 경로다
  assert.deepEqual(r('#/architecture/sys?level=nope&split=nope'), ['architecture', 2, base]);
  assert.deepEqual(r('#/architecture/a/b/c'), ['overview', -1, {}]);
  assert.equal(archHash({}), '#/architecture');
  assert.equal(archHash({ focus: 'sys', split: 'code' }), '#/architecture?split=code');
  assert.equal(archHash({ focus: 'part:web', flow: 'booking/pay', level: 'fn', show: ['tests'] }), '#/architecture/part%3Aweb/booking%2Fpay?level=fn&show=tests');
  for (const f of ['sys', 'part:web', 'community:12', 'group:api', 'web/src/pages/Pay.tsx', 'web/src/pages/Pay.tsx:Pay']) {
    assert.equal(parseRoute(archHash({ focus: f })).params.focus, f);
  }
});

// ---- 로드맵 트리 배치(ui/lib/tree.js): 열 모드, 층, 열 안 순서, 잠김, 더미, 순환, 미배정, 역행, 우회 차선, 조상·자손, 기하 ----
// 마일스톤 자료는 test/fixtures/roadmap/*.md를 mini에 끼워 엔진으로 빌드한 data(= data.json)에서 가져온다(선행이 {id,title,status} 객체다).
// 층 자료는 실사용 13개 로드맵과 같은 모양의 합성 자료다(Phase 0 재측정: 깊이별 [2,1,2,2,2,4], 선행 12, 잠김 3, 긴 엣지 0).

const TREE_MINI = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mini');
const TREE_FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'roadmap');
const treeTmp = [];
test.after(() => { for (const d of treeTmp) rmSync(d, { recursive: true, force: true }); });
const fxCache = new Map();
async function roadmapFixture(name) {
  if (fxCache.has(name)) return fxCache.get(name);
  const { buildGraph } = await import('../src/cli.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'livemap 트리 검사-'));
  treeTmp.push(dir);
  cpSync(TREE_MINI, dir, { recursive: true });
  copyFileSync(join(TREE_FX, `${name}.md`), join(dir, 'tasks/roadmap.md'));
  const { data } = await buildGraph(dir);
  fxCache.set(name, data);
  return data;
}

let ord = 0;
const R = (id, status, deps = [], milestone = null) => ({ id, order: ++ord, title: `제목 ${id}`, status, mode: '계획', milestone, deps, scenes: [] });
const TWIN = (() => {
  ord = 0;
  return [
    R('wire', '완료'), R('data', '완료', ['wire']), R('find', '완료', ['data']), R('join', '완료', ['data']),
    R('open', '완료', ['join']), R('book', '완료', ['find', 'join']), R('desk', '완료', ['book']), R('lever', '진행', ['open']),
    R('pay', '완료'), R('gaps', '다음', ['lever']), R('cap', '다음', ['lever']), R('social', '다음', ['lever']), R('later', '다음', ['desk']),
  ];
})();
const colIds = (t) => t.columns.map((c) => c.ids);
const lockedIds = (t) => Object.keys(t.nodes).filter((id) => t.nodes[id].locked).sort();
const longEdges = (t) => t.edges.filter((e) => e.via.length > 0);
const chain = (n, status = '다음') => { ord = 0; return Array.from({ length: n }, (_, i) => R(`c${i}`, status, i ? [`c${i - 1}`] : [])); };
// 시드 고정 난수(검사 결정성)
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('SC-1·SC-13 tree 열 모드: 마일스톤 0건이면 layer, 1건 이상이면 milestone', async () => {
  assert.equal(buildTree(TWIN, []).mode, 'layer');
  assert.equal(buildTree(TWIN, undefined).mode, 'layer');
  const m = await roadmapFixture('ms-normal');
  assert.equal(buildTree(m.roadmap, m.milestones).mode, 'milestone');
  assert.equal(buildTree(TWIN, [{ id: 'only', order: 1, title: '하나' }]).mode, 'milestone');
});

test('SC-1·SC-3·SC-5 tree 층 할당: 13개 합성 자료가 깊이별 [2,1,2,2,2,4], 선행 12, 잠김 3, 교차 0으로 선다', () => {
  const t = buildTree(TWIN, []);
  assert.equal(Object.keys(t.nodes).length, 13);
  assert.deepEqual(t.columns.map((c) => c.ids.length), [2, 1, 2, 2, 2, 4]);
  assert.deepEqual(t.columns.map((c) => c.kind), Array(6).fill('layer'));
  assert.deepEqual(t.columns.map((c) => c.index), [0, 1, 2, 3, 4, 5]);
  // 열 안 순서: 교차가 0이 되는 배치(3층 [find, join], 4층 [book, open], 6층은 later가 맨 위)
  assert.deepEqual(colIds(t), [['wire', 'pay'], ['data'], ['find', 'join'], ['book', 'open'], ['desk', 'lever'], ['later', 'gaps', 'cap', 'social']]);
  assert.equal(crossings(t), 0);
  assert.equal(t.edges.length, 12);
  assert.equal(longEdges(t).length, 0);
  assert.deepEqual(lockedIds(t), ['cap', 'gaps', 'social']);
  assert.deepEqual(t.nodes.gaps.blockedByDeps, ['lever']);
  assert.equal(t.nodes.later.locked, false); // 선행 desk가 완료
  assert.deepEqual(t.nodes.lever.children, ['gaps', 'cap', 'social']);
  for (const id of Object.keys(t.nodes)) {
    const n = t.nodes[id];
    assert.equal(t.columns[n.column].ids[n.row], id);
    assert.equal(n.depth, n.column);
  }
  assert.deepEqual(t.columns[5].counts, { 완료: 0, 진행: 0, 다음: 4, 대기: 0, 이후: 0 });
  assert.deepEqual(t.cyclic, []);
});

test('SC-5 tree 고아: 선행도 후속도 없는 항목은 layer 모드 1층에 든다', () => {
  const t = buildTree(TWIN, []);
  assert.equal(t.nodes.pay.column, 0);
  assert.equal(t.nodes.pay.depth, 0);
  assert.deepEqual(t.nodes.pay.children, []);
  // 선행이 모두 없으면 1열에 전부
  ord = 0;
  const flat = buildTree([R('a', '다음'), R('b', '다음'), R('c', '완료')], []);
  assert.deepEqual(colIds(flat), [['a', 'b', 'c']]);
  assert.equal(flat.edges.length, 0);
});

test('SC-5 tree 순환: a → b → a에서 멈추지 않고, layer는 순환 열을 만들고 milestone은 자기 열에 둔다', () => {
  const items = [
    { id: 'a', order: 1, title: 'a', status: '다음', deps: ['b'], scenes: [], milestone: 'm1' },
    { id: 'b', order: 2, title: 'b', status: '다음', deps: ['a'], scenes: [], milestone: 'm1' },
    { id: 'r', order: 3, title: 'r', status: '완료', deps: [], scenes: [], milestone: 'm1' },
    { id: 'c', order: 4, title: 'c', status: '다음', deps: ['r'], scenes: [], milestone: 'm2' },
  ];
  const t = buildTree(items, []);
  assert.deepEqual([...t.cyclic].sort(), ['a', 'b']);
  assert.deepEqual(t.columns.filter((c) => c.kind === 'cycle').length, 1);
  assert.equal(t.columns.at(-1).kind, 'cycle');
  assert.deepEqual([...t.columns.at(-1).ids].sort(), ['a', 'b']);
  assert.deepEqual(colIds(t).slice(0, -1), [['r'], ['c']]);
  assert.equal(t.nodes.a.depth, null);
  const cyc = t.edges.filter((e) => e.cyclic).map((e) => e.id).sort();
  assert.deepEqual(cyc, ['a>b', 'b>a']);
  assert.ok(t.edges.filter((e) => e.cyclic).every((e) => e.sameColumn && Number.isInteger(e.lane)));
  assert.equal(t.edges.find((e) => e.id === 'r>c').cyclic, false);
  // 순환 항목도 잠김 규칙은 같다
  assert.deepEqual(lockedIds(t), ['a', 'b']);

  const ms = [{ id: 'm1', order: 1, title: '하나' }, { id: 'm2', order: 2, title: '둘' }];
  const tm = buildTree(items, ms);
  assert.deepEqual([...tm.cyclic].sort(), ['a', 'b']);
  assert.equal(tm.columns.filter((c) => c.kind === 'cycle').length, 0);
  assert.equal(tm.nodes.a.column, 0);
  assert.equal(tm.nodes.b.column, 0);
  assert.deepEqual(tm.columns.map((c) => c.kind), ['milestone', 'milestone']);
  // 자기 참조도 순환이다
  const self = buildTree([{ id: 's', order: 1, title: 's', status: '다음', deps: ['s'], scenes: [] }], []);
  assert.deepEqual(self.cyclic, ['s']);
  assert.equal(self.edges[0].cyclic, true);
});

test('SC-5 tree 긴 엣지: layer 모드에서 열 차 2 이상은 중간 열 더미로 쪼개고 milestone 모드는 더미 0', async () => {
  ord = 0;
  const items = [R('a', '완료'), R('b', '완료', ['a']), R('c', '다음', ['b', 'a'])];
  const t = buildTree(items, []);
  const long = t.edges.find((e) => e.id === 'a>c');
  assert.equal(long.span, 2);
  assert.equal(long.via.length, 1);
  const d = t.dummies[long.via[0]];
  assert.equal(d.column, 1);
  assert.equal(t.columns[1].slots[d.row], long.via[0]);
  assert.deepEqual(t.columns[1].ids, ['b']); // 더미는 항목 목록에 들지 않는다
  assert.equal(t.nodes[long.via[0]], undefined);
  assert.equal(t.edges.find((e) => e.id === 'b>c').via.length, 0);

  // 합성 40개(scale40): 긴 엣지 4건, 전부 열 차 2
  const s = await roadmapFixture('scale40');
  const ts = buildTree(s.roadmap, s.milestones);
  assert.equal(ts.mode, 'layer');
  assert.deepEqual(longEdges(ts).map((e) => e.id).sort(), ['audit-base>audit-view', 'config-ui>perm-report', 'perm-report>search-share', 'retention>share-link']);
  assert.ok(longEdges(ts).every((e) => e.span === 2 && e.via.length === 1));
  assert.equal(Object.keys(ts.dummies).length, 4);

  const m = await roadmapFixture('ms-backward');
  const tm = buildTree(m.roadmap, m.milestones);
  assert.equal(Object.keys(tm.dummies).length, 0);
  assert.ok(tm.edges.every((e) => e.via.length === 0));
});

test('SC-3 tree 잠김: 완료·진행이 아니고 선행이 미완이면 잠김, 진행은 선행이 미완이어도 잠김이 아니다', () => {
  ord = 0;
  const items = [R('p', '진행'), R('w', '대기', ['p']), R('l', '이후', ['p']), R('n', '다음', ['p']), R('g', '진행', ['p']), R('f', '완료', ['p']),
    R('ok', '이후', ['f']), R('ghost', '다음', ['nope'])];
  const t = buildTree(items, []);
  assert.deepEqual(lockedIds(t), ['l', 'n', 'w']);
  assert.equal(t.nodes.g.locked, false);
  assert.deepEqual(t.nodes.g.blockedByDeps, ['p']);
  assert.equal(t.nodes.ok.locked, false);
  assert.deepEqual(t.nodes.ok.blockedByDeps, []);
  // 없는 선행 id는 엣지도 잠김도 만들지 않는다(엔진이 「선행 항목 없음」을 따로 낸다)
  assert.equal(t.nodes.ghost.locked, false);
  assert.equal(t.nodes.ghost.depth, 0);
  assert.ok(!t.edges.some((e) => e.from === 'nope' || e.to === 'nope'));
  // data.json 모양(선행이 객체)도 같게 읽는다
  const asData = items.map((it) => ({ ...it, deps: it.deps.map((id) => ({ id, title: id, status: null })) }));
  assert.deepEqual(buildTree(asData, []), t);
});

test('SC-4 tree pathOf: 고른 항목의 조상·자손과 그 사이 엣지만, 형제는 빼고 마일스톤 id·null은 빈 집합', async () => {
  const t = buildTree(TWIN, []);
  const p = pathOf(t, 'book');
  assert.deepEqual([...p.nodes].sort(), ['book', 'data', 'desk', 'find', 'join', 'later', 'wire']);
  assert.deepEqual([...p.edges].sort(), ['book>desk', 'data>find', 'data>join', 'desk>later', 'find>book', 'join>book', 'wire>data']);
  assert.ok(!p.nodes.has('open')); // join의 다른 자식(형제 갈래)
  assert.ok(!p.edges.has('join>open'));
  assert.deepEqual([...p.ancestors].sort(), ['data', 'find', 'join', 'wire']);
  assert.deepEqual([...p.descendants].sort(), ['desk', 'later']);
  const lever = pathOf(t, 'lever');
  assert.ok(!lever.nodes.has('later'));
  assert.ok(['gaps', 'cap', 'social'].every((id) => lever.nodes.has(id)));
  // pathOf가 돌려준 엣지는 전부 tree.edges의 id다
  assert.ok([...lever.edges].every((id) => t.edges.some((e) => e.id === id)));
  for (const sel of [null, undefined, '없는-마일스톤-id']) {
    assert.equal(pathOf(t, sel).nodes.size, 0);
    assert.equal(pathOf(t, sel).edges.size, 0);
  }
  const m = await roadmapFixture('ms-normal');
  const tm = buildTree(m.roadmap, m.milestones);
  assert.equal(pathOf(tm, 'search-release').nodes.size, 0);
  assert.equal(pathOf(tm, 'search').nodes.has('schema'), true);
});

test('SC-5 tree 결정성: 같은 입력은 같은 출력이고 입력 배열 순서가 달라도 같다', async () => {
  assert.deepEqual(JSON.stringify(buildTree(TWIN, [])), JSON.stringify(buildTree(TWIN, [])));
  assert.deepEqual(buildTree([...TWIN].reverse(), []), buildTree(TWIN, []));
  const s = await roadmapFixture('scale40');
  assert.deepEqual(JSON.stringify(buildTree(s.roadmap, [])), JSON.stringify(buildTree([...s.roadmap].reverse(), [])));
  const m = await roadmapFixture('ms-unassigned');
  assert.deepEqual(buildTree([...m.roadmap].reverse(), [...m.milestones].reverse()), buildTree(m.roadmap, m.milestones));
});

test('SC-5 tree 교차: layer 모드 7개 이하 열의 전수 탐색이 중심값 정렬보다 교차가 같거나 적다', () => {
  let strict = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed);
    ord = 0;
    const items = [];
    // 4열 × 열마다 3~6개, 앞 열로 선행 1~2개
    const layers = [];
    for (let l = 0; l < 4; l++) {
      const n = 3 + Math.floor(r() * 4);
      layers.push([]);
      for (let k = 0; k < n; k++) {
        const id = `n${l}-${k}`;
        const deps = l ? [...new Set([layers[l - 1][Math.floor(r() * layers[l - 1].length)], layers[l - 1][Math.floor(r() * layers[l - 1].length)]])] : [];
        items.push(R(id, '다음', deps));
        layers[l].push(id);
      }
    }
    const ex = buildTree(items, []);
    const bc = buildTree(items, [], { exhaustiveMax: 0 });
    assert.ok(ex.columns.every((c) => c.slots.length <= 7));
    assert.ok(crossings(ex) <= crossings(bc), `seed ${seed}: 전수 ${crossings(ex)} > 중심값 ${crossings(bc)}`);
    if (crossings(ex) < crossings(bc)) strict++;
  }
  assert.ok(strict > 0, '전수 탐색이 중심값 정렬보다 나은 경우가 하나도 없다');
});

test('SC-13 tree 마일스톤 열: 열 순서는 마일스톤 order, 같은 마일스톤은 같은 열, 열 안은 선행 깊이 오름차순 · 같으면 order', async () => {
  const m = await roadmapFixture('ms-normal');
  const t = buildTree(m.roadmap, m.milestones);
  assert.deepEqual(t.columns.map((c) => [c.kind, c.msId, c.label]), [['milestone', 'base', '기반 공개'], ['milestone', 'search-release', '검색 공개'], ['milestone', 'pay-release', '결제 공개']]);
  for (const it of m.roadmap) assert.equal(t.columns[t.nodes[it.id].column].msId, it.milestone);
  assert.deepEqual(colIds(t), [['schema', 'signin', 'perm'], ['index', 'search', 'request'], ['deposit', 'receipt']]);
  // 파일 순서가 뒤집힌 마일스톤 배열을 받아도 order대로 놓는다(화면은 재정렬하지 않는다)
  assert.deepEqual(buildTree(m.roadmap, [...m.milestones].reverse()).columns.map((c) => c.msId), ['base', 'search-release', 'pay-release']);
  // 깊이 오름차순이 order를 이긴다
  const items = [
    { id: 'late', order: 1, title: 'late', status: '다음', deps: ['early'], scenes: [], milestone: 'm' },
    { id: 'early', order: 2, title: 'early', status: '완료', deps: [], scenes: [], milestone: 'm' },
    { id: 'orphan', order: 3, title: 'orphan', status: '다음', deps: [], scenes: [], milestone: 'm' },
  ];
  assert.deepEqual(colIds(buildTree(items, [{ id: 'm', order: 1, title: 'm' }])), [['early', 'orphan', 'late']]);
  // 묶인 항목이 없는 마일스톤은 빈 열로 선다
  const empty = buildTree(items, [{ id: 'm', order: 1, title: 'm' }, { id: 'none', order: 2, title: '빈 묶음' }]);
  assert.deepEqual(empty.columns.map((c) => [c.kind, c.msId, c.ids.length]), [['milestone', 'm', 3], ['milestone', 'none', 0]]);
  assert.equal(t.edges.filter((e) => e.backward).length, 0);
});

test('SC-13 tree 미배정 열: 마일스톤이 비었거나 없는 id를 가리키면 맨 오른쪽 unassigned 열, 0건이면 그 열이 없다', async () => {
  const u = await roadmapFixture('ms-unassigned');
  assert.equal(u.roadmap.find((r) => r.id === 'receipt').milestone, 'ghost-release'); // 엔진은 없는 id를 그대로 남긴다(DEC-48)
  const t = buildTree(u.roadmap, u.milestones);
  assert.equal(t.columns.filter((c) => c.kind === 'unassigned').length, 1);
  const last = t.columns.at(-1);
  assert.equal(last.kind, 'unassigned');
  assert.equal(last.msId, null);
  assert.equal(last.label, '마일스톤 없음');
  assert.deepEqual([...last.ids].sort(), ['archive', 'audit', 'receipt', 'usage']);
  assert.deepEqual(last.ids, ['archive', 'audit', 'usage', 'receipt']); // 깊이 0·1·2·3
  assert.deepEqual(t.columns.map((c) => c.msId), ['base', 'search-release', null]);
  const n = await roadmapFixture('ms-normal');
  assert.equal(buildTree(n.roadmap, n.milestones).columns.filter((c) => c.kind === 'unassigned').length, 0);
});

test('SC-13 tree 역행 엣지: 오른쪽 열에서 왼쪽 열로 가는 선행 엣지에 backward', async () => {
  const m = await roadmapFixture('ms-backward');
  const t = buildTree(m.roadmap, m.milestones);
  const back = t.edges.filter((e) => e.backward);
  assert.deepEqual(back.map((e) => [e.id, e.span]).sort(), [['notify-rules>notify', -1], ['shared-search>search', -2]]);
  assert.ok(t.edges.filter((e) => !e.backward).every((e) => e.span >= 0));
  assert.equal(t.edges.find((e) => e.id === 'shared-search>notify-rules').sameColumn, true);
  assert.equal(buildTree(TWIN, []).edges.filter((e) => e.backward).length, 0);
});

test('SC-13 tree 우회 차선: 같은 열 안 엣지는 세로 구간이 겹치면 차선이 다르고 안 겹치면 같은 차선', () => {
  const ms = [{ id: 'm', order: 1, title: 'm' }];
  const mk = (id, order, deps) => ({ id, order, title: id, status: '다음', deps, scenes: [], milestone: 'm' });
  // a가 b·c·d의 선행: 구간 [0,1]·[0,2]·[0,3]이 서로 겹친다
  const fan = buildTree([mk('a', 1, []), mk('b', 2, ['a']), mk('c', 3, ['a']), mk('d', 4, ['a'])], ms);
  assert.deepEqual(colIds(fan), [['a', 'b', 'c', 'd']]);
  const lanes = fan.edges.map((e) => e.lane);
  assert.equal(new Set(lanes).size, 3);
  assert.ok(fan.edges.every((e) => e.sameColumn));
  assert.equal(fan.columns[0].lanes, 3);
  // a → b → c → d: [0,1]과 [2,3]은 안 겹쳐 같은 차선, 끝점을 공유하는 [1,2]는 다른 차선
  const ch = buildTree([mk('a', 1, []), mk('b', 2, ['a']), mk('c', 3, ['b']), mk('d', 4, ['c'])], ms);
  const lane = (id) => ch.edges.find((e) => e.id === id).lane;
  assert.equal(lane('a>b'), lane('c>d'));
  assert.notEqual(lane('a>b'), lane('b>c'));
  assert.equal(ch.columns[0].lanes, 2);
  assert.equal(ch.lanes, 2);
  // 열을 건너는 엣지는 차선이 없다
  assert.ok(buildTree(TWIN, []).edges.every((e) => !e.sameColumn && e.lane === null));
});

test('SC-1 tree geometry: 6열·폭 1400은 노드 폭 150~240에 스크롤 없음, 12열·폭 600은 스크롤, 높이는 인원 × 92 + 간격 14 + 여백 12', async () => {
  const t = buildTree(TWIN, []);
  const g = geometry(t, 1400);
  assert.ok(g.nodeW >= 150 && g.nodeW <= 240, `nodeW ${g.nodeW}`);
  assert.equal(g.scroll, false);
  assert.equal(g.nodeH, 92);
  assert.equal(g.gapX, 40);
  assert.equal(g.gapY, 14);
  assert.equal(g.padLeft, 8);
  assert.ok(g.W <= 1400);
  assert.equal(g.H, 4 * 92 + 3 * 14 + 12);
  assert.equal(geometry(t, 800).scroll, true); // 폭 800에 6열은 바닥(정상 동작)
  assert.equal(geometry(t, 600).nodeW, 150);

  const t12 = buildTree(chain(12), []);
  assert.equal(t12.columns.length, 12);
  const g12 = geometry(t12, 600);
  assert.equal(g12.scroll, true);
  assert.equal(g12.nodeW, 150);
  assert.ok(g12.W > 600);
  assert.equal(geometry(t12, 4000).nodeW, 240); // 천장: (4000 − 440 − 32) ÷ 12 = 294

  // 합성 40개(Phase 0 SCALE40): 10열, 폭 1440·800 둘 다 바닥, 전체 폭 1,892px, 높이 846px
  const s = await roadmapFixture('scale40');
  const ts = buildTree(s.roadmap, []);
  assert.equal(ts.columns.length, 10);
  for (const w of [1440, 800]) {
    const gs = geometry(ts, w);
    assert.deepEqual([gs.nodeW, gs.scroll, gs.W, gs.H], [150, true, 1892, 846]);
  }
  // 빈 트리도 던지지 않는다
  const e = buildTree([], []);
  assert.deepEqual([e.mode, e.columns.length, e.edges.length], ['layer', 0, 0]);
  assert.equal(geometry(e, 1400).scroll, false);
});

test('SC-13 tree geometry: milestone 모드는 padLeft = 8 × 차선수 + 8, gapX = 40 + 8 × 차선수, 열 왼쪽 x에 여백이 든다', () => {
  const ms = [{ id: 'm', order: 1, title: 'm' }, { id: 'n', order: 2, title: 'n' }];
  const mk = (id, order, deps, milestone = 'm') => ({ id, order, title: id, status: '다음', deps, scenes: [], milestone });
  const byLanes = [];
  for (const k of [0, 1, 2, 3]) {
    // m 열에 a와 a의 자식 k개: 차선 k개
    const items = [mk('a', 1, []), ...Array.from({ length: k }, (_, i) => mk(`k${i}`, i + 2, ['a'])), mk('z', 9, ['a'], 'n')];
    const t = buildTree(items, ms);
    assert.equal(t.lanes, k);
    const g = geometry(t, 1400);
    assert.equal(g.padLeft, 8 * k + 8);
    assert.equal(g.gapX, 40 + 8 * k);
    assert.equal(g.colX[0], Math.max(16, g.padLeft));
    assert.equal(g.colX[1], g.colX[0] + g.nodeW + g.gapX);
    assert.ok(g.W <= 1400 || g.scroll);
    byLanes.push(g.padLeft);
  }
  assert.deepEqual(byLanes, [8, 16, 24, 32]);
});

// ---- 캡처 패널 범위(ui/lib/capture.js): 고르기 전 미리보기, 고른 기능 범위, 빈 범위, 되돌림 기준(DEC-24·DEC-38·DEC-39) ----
const CAPS = [
  ['d', 'home'], ['d', 'resorts'], ['d', 'detail'], ['q', 'login'], ['q', 'detail'], ['q', 'quote'], ['t', 'teams'], ['b', 'mine'], ['o', 'today'],
].map(([journey, f]) => ({ file: `${f}.jpg`, journey, step: f }));

test('SC-14 visibleCaptures: 고르기 전 미리보기는 1.2.0 선택과 같다 — 기능마다 첫 장, 이미 보인 파일은 건너뜀, previewCount(기본 5)까지(DEC-52)', () => {
  const v = visibleCaptures(CAPS, { selected: 'd', userPicked: false });
  assert.deepEqual(v.list.map((c) => `${c.journey}/${c.file}`), ['d/home.jpg', 'q/login.jpg', 't/teams.jpg', 'b/mine.jpg', 'o/today.jpg']);
  assert.deepEqual([v.scoped, v.key], [false, '']);
  assert.deepEqual(visibleCaptures(CAPS, {}).list, v.list);
  assert.deepEqual(visibleCaptures(CAPS, { previewCount: 3 }).list.map((c) => c.journey), ['d', 'q', 't']);
  // 앞 기능이 이미 보인 파일은 건너뛰고 그 기능의 다음 장을 쓴다(같은 그림을 두 번 보이지 않는다)
  const shared = [{ file: 'a.jpg', journey: 'x', step: '1' }, { file: 'a.jpg', journey: 'y', step: '1' }, { file: 'b.jpg', journey: 'y', step: '2' }];
  assert.deepEqual(visibleCaptures(shared, {}).list.map((c) => `${c.journey}/${c.file}`), ['x/a.jpg', 'y/b.jpg']);
  // 기능이 5개보다 적으면 기능 수만큼(1.2.0과 같다)
  assert.equal(visibleCaptures(CAPS.slice(0, 4), {}).list.length, 2);
});

test('SC-7 visibleCaptures: 사용자가 기능을 고르면 그 기능 캡처만, 범위 신원은 기능 id', () => {
  const v = visibleCaptures(CAPS, { selected: 'q', userPicked: true });
  assert.deepEqual(v.list.map((c) => c.step), ['login', 'detail', 'quote']);
  assert.deepEqual([v.scoped, v.key], [true, 'q']);
});

test('SC-8 visibleCaptures: 고른 기능에 캡처가 없으면 빈 목록이고 범위는 유지한다', () => {
  const v = visibleCaptures(CAPS, { selected: 'notify', userPicked: true });
  assert.deepEqual([v.list.length, v.scoped, v.key], [0, true, 'notify']);
  assert.deepEqual(visibleCaptures([], { selected: 'd', userPicked: true }).list, []);
});

// ---- 구조 화면 배치(ui/lib/arch.js, 스펙 PN-21·PN-22 · 「화면 모델」): 층 순서와 두 줄 격자, barycenter 두 번,
// 순환 층 사이 선, 허브 들어오는 선 묶기, 기능 교집합, 1홉 이웃, 묶음 구역 배치와 집계, 묶음 단위 접기.
// 합성 자료로 기대 수를 정한다(표본 수치는 넣지 않는다). 좌표는 픽셀이고 같은 입력이면 같아야 한다(SC-11) ----
const C = (id, name, zone, nodes, extra = {}) => ({ id, name, zone, nodes, lanes: [], visible: true, inherited: 0, ...extra });
const M = (id, container, lane, community, communityName, deps = [], violations = []) => ({ id, container, lane, community, communityName, symbols: 1, deps, violations });
const ARCH = {
  status: 'ok', graphMissing: false, inherited: 3, deferred: 'count',
  containers: [
    { id: 'web', name: '웹 화면', kind: 'ours', boundary: 'browser', dirs: ['web/src'], schemas: [], counts: { screens: 1, files: 4, symbols: 9, mocks: 1 }, deps: ['bff'], flows: 1, externals: [], src: { file: 'map/architecture/web.md', line: 1 } },
    { id: 'bff', name: 'BFF 서버', kind: 'ours', boundary: 'homelab', dirs: ['app'], schemas: [], counts: { screens: 0, files: 1, symbols: 3, mocks: 0 }, deps: ['db'], flows: 0, externals: [], src: { file: 'map/architecture/bff.md', line: 1 } },
    { id: 'db', name: '데이터베이스', kind: 'ours', boundary: 'homelab', dirs: ['sql'], schemas: [], counts: { screens: 0, files: 0, symbols: 0, mocks: 0 }, deps: [], flows: 0, externals: [], src: { file: 'map/architecture/db.md', line: 1 } },
    { id: 'mail', name: '메일', kind: 'external', boundary: 'outside', dirs: [], schemas: [], counts: { screens: 0, files: 0, symbols: 0, mocks: 0 }, deps: [], flows: 0, externals: [], src: { file: 'map/architecture/README.md', line: 9 } },
  ],
  lanes: [
    { id: 'screen', name: '화면', container: 'web', kind: 'screen', nodes: 1, visible: true },
    { id: 'pages', name: '화면 파일', container: 'web', kind: 'code', nodes: 2, visible: true },
    { id: 'lib', name: '자료 받기', container: 'web', kind: 'code', nodes: 2, visible: true },
    { id: 'api', name: 'api', container: 'bff', kind: 'api', nodes: 1, visible: true },
    { id: 'function', name: 'function', container: 'db', kind: 'function', nodes: 1, visible: true },
    { id: 'table', name: 'table', container: 'db', kind: 'table', nodes: 1, visible: true },
    { id: 'tests', name: '검사', container: null, kind: 'code', nodes: 1, visible: false },
  ],
  // pages ↔ lib 가 서로를 부르는 순환이다
  laneLinks: [
    { from: 'screen', to: 'api', n: 5 }, { from: 'pages', to: 'lib', n: 4 }, { from: 'lib', to: 'pages', n: 1 },
    { from: 'api', to: 'function', n: 3 }, { from: 'function', to: 'table', n: 7 }, { from: 'tests', to: 'lib', n: 2 },
  ],
  communities: [C(1, 'A.tsx', 'web', 2, { lanes: ['pages'], inherited: 1 }), C(2, 'api.ts', 'web', 2, { lanes: ['lib'] }), C(3, 'server.mjs', 'bff', 1, { inherited: 2 }), C(5, 'get_x', 'db', 3), C(4, 'a.test.mjs', null, 1)],
  communityLinks: [
    { from: 1, to: 2, n: 3, kinds: { imports: 3 } }, { from: 2, to: 1, n: 1, kinds: { imports: 1 } },
    { from: 2, to: 3, n: 2, kinds: { calls: 2 } }, { from: 3, to: 5, n: 4, kinds: { invokes: 4 } },
    { from: 1, to: 4, n: 6, kinds: { imports: 6 } }, { from: 4, to: 2, n: 1, kinds: { imports: 1 } },
  ],
  modules: [
    M('web/src/pages/A.tsx', 'web', 'pages', 1, 'A.tsx', ['web/src/lib/api.ts', 'web/src/lib/util.ts']),
    M('web/src/pages/B.tsx', 'web', 'pages', 1, 'A.tsx', ['web/src/lib/api.ts', 'web/src/lib/util.ts']),
    M('web/src/lib/api.ts', 'web', 'lib', 2, 'api.ts', ['web/src/lib/util.ts']),
    M('web/src/lib/util.ts', 'web', 'lib', 2, 'api.ts', []),
    M('app/server.mjs', 'bff', null, 3, 'server.mjs', [], [{ code: 'architecture.layer-violation', to: 'web/src/lib/util.ts', at: { file: 'app/server.mjs', line: 4 } }]),
    M('tests/a.test.mjs', null, 'tests', 4, 'a.test.mjs', ['web/src/lib/util.ts']),
  ],
  flows: [{
    id: 'f1', name: '결제', status: 'live', container: 'web', step: 'j/s', counts: { screen: 1, file: 2, api: 1, auth: 0, fn: 1, table: 1 }, broken: [],
    story: '화면 1개에서 API 1개를 부른다',
    nodes: ['screen:/pay', 'module:web/src/pages/A.tsx', 'module:web/src/lib/api.ts', 'api:/api/pay', 'function:pay', 'table:t.payments'],
    path: [{ kind: 'screen', ref: '/pay', node: 'screen:/pay' }, { kind: 'api', ref: 'POST /api/pay', node: 'api:/api/pay' }, { kind: 'function', ref: 'pay', node: 'function:pay' }, { kind: 'table', ref: 't.payments', node: 'table:t.payments' }],
  }],
  violations: [{ code: 'architecture.layer-violation', from: 'app/server.mjs', to: 'web/src/lib/util.ts', at: { file: 'app/server.mjs', line: 4 } }],
  bridges: { made: 3, moved: 4, byKind: {}, matched: {}, unmatched: { livemapOnly: 0, unreached: 0 } },
  graphify: { nodes: 20, edges: 24, relations: 4, communities: 5, inferred: 1, typeOnly: 0, deferred: 0, unknownRelations: {} },
  declaration: { dir: 'map/architecture', diagram: { direction: 'LR', boundaries: [] }, problems: 0 },
};
const clone = (x) => JSON.parse(JSON.stringify(x));

test('SC-11 laneLayout 층 요약: 보이는 층만 두 줄 격자에 상자 하나씩, 같은 입력이면 좌표가 같다', () => {
  const a = laneLayout(ARCH, {});
  assert.equal(a.mode, 'summary');
  assert.deepEqual(a.boxes.map((b) => b.id), ['screen', 'pages', 'lib', 'api', 'function', 'table']);
  assert.equal(a.boxes.length, ARCH.lanes.filter((l) => l.visible).length);
  assert.deepEqual(a.boxes.map((b) => b.n), [1, 2, 2, 1, 1, 1]);
  // 두 줄 격자: 행이 둘이고 같은 행은 y가 같다
  const rows = [...new Set(a.boxes.map((b) => b.y))];
  assert.equal(rows.length, 2);
  assert.equal(new Set(a.boxes.filter((b) => b.y === rows[0]).map((b) => b.x)).size, a.boxes.filter((b) => b.y === rows[0]).length);
  // 숨긴 층으로 가는 선은 그리지 않고 수만 남긴다(tests → lib 2건)
  assert.deepEqual(a.lines.map((l) => [l.from, l.to, l.n]), [['screen', 'api', 5], ['pages', 'lib', 4], ['lib', 'pages', 1], ['api', 'function', 3], ['function', 'table', 7]]);
  assert.equal(a.boxes.find((b) => b.id === 'lib').hiddenN, 2);
  assert.deepEqual(laneLayout(ARCH, {}), a);
  assert.deepEqual(laneLayout(clone(ARCH), {}), a);
});

test('SC-11 laneLayout 층 순서: 열이 층 사이 선의 깊이 순서이고 순환 층 사이 선은 되돌아가는 선으로 남는다', () => {
  const a = laneLayout(ARCH, { mode: 'nodes', focus: 'sys' });
  // pages(0) → lib(1) → pages 는 순환이다. 되돌아가는 선만 back 이고 열은 끝난다
  const col = Object.fromEntries(a.columns.flatMap((c) => c.lanes.map((id) => [id, c.index])));
  assert.ok(col.pages < col.lib, `pages ${col.pages} < lib ${col.lib}`);
  assert.ok(col.screen < col.api && col.api < col.function && col.function < col.table);
  // 같은 깊이·같은 부품의 층은 LANE_ORDER 종류 순서로 갈린다
  assert.deepEqual(LANE_ORDER, ['screen', 'code', 'api', 'auth', 'function', 'table']);
  const summary = laneLayout(ARCH, {});
  const back = summary.lines.filter((l) => l.back).map((l) => `${l.from}>${l.to}`);
  assert.deepEqual(back, ['lib>pages']);
  assert.equal(summary.lines.filter((l) => !l.back).length, 4);
});

test('SC-11 laneLayout barycenter: 열 안 순서를 앞 열 이웃 자리의 평균으로 두 번 돌리고 같은 값은 id 순이다', () => {
  const a = laneLayout(ARCH, { mode: 'nodes', focus: 'part:web' });
  assert.equal(a.sweeps, 2);
  // pages 열의 A·B 는 같은 이웃을 가져 id 순, lib 열은 A·B 의 평균 자리로 api.ts 가 util.ts 보다 위다
  const rowOf = Object.fromEntries(a.boxes.map((b) => [b.id, b.row]));
  assert.deepEqual([rowOf['web/src/pages/A.tsx'], rowOf['web/src/pages/B.tsx']], [0, 1]);
  assert.ok(rowOf['web/src/lib/api.ts'] < rowOf['web/src/lib/util.ts']);
  assert.deepEqual(laneLayout(ARCH, { mode: 'nodes', focus: 'part:web' }), a);
});

test('SC-11 laneLayout 허브 묶기: 들어오는 선이 hubMin 이상인 노드는 앞 열마다 한 가닥으로 묶고 묶은 선은 초점을 옮기지 않는다', () => {
  const a = laneLayout(ARCH, { mode: 'nodes', focus: 'sys', hidden: [], hubMin: 3 });
  const hub = 'web/src/lib/util.ts';
  const into = a.lines.filter((l) => l.to === hub);
  assert.equal(into.length, 2, JSON.stringify(into));
  const bundled = into.find((l) => l.bundled);
  assert.ok(bundled, '묶은 선이 있어야 한다');
  assert.deepEqual(bundled.members.sort(), ['web/src/pages/A.tsx', 'web/src/pages/B.tsx']);
  assert.equal(bundled.n, 2);
  assert.equal(bundled.focusable, false);
  // hubMin 을 올리면 묶지 않는다
  assert.equal(laneLayout(ARCH, { mode: 'nodes', focus: 'sys', hubMin: 9 }).lines.filter((l) => l.bundled).length, 0);
});

test('SC-7 laneLayout 기능 교집합: 초점과 기능이 함께면 초점 범위와 기능의 길이 겹치는 노드만 남는다', () => {
  const all = laneLayout(ARCH, { mode: 'nodes', focus: 'part:web' });
  assert.deepEqual(all.boxes.map((b) => b.id).sort(), ['web/src/lib/api.ts', 'web/src/lib/util.ts', 'web/src/pages/A.tsx', 'web/src/pages/B.tsx']);
  const cut = laneLayout(ARCH, { mode: 'nodes', focus: 'part:web', flow: 'f1' });
  assert.deepEqual(cut.boxes.map((b) => b.id).sort(), ['web/src/lib/api.ts', 'web/src/pages/A.tsx']);
  // 기능만 고르면 기능의 길 전체가 선다(초점 sys)
  const path = laneLayout(ARCH, { mode: 'nodes', focus: 'sys', flow: 'f1' });
  assert.equal(path.boxes.length, 6);
  assert.ok(path.boxes.every((b) => b.onFlow));
});

test('SC-11 neighbors 1홉: 들어오는 호출과 나가는 호출이 관계 방향으로 갈리고 없는 노드는 빈 목록이다', () => {
  const n = neighbors(ARCH, 'web/src/lib/util.ts');
  assert.deepEqual(n.in.sort(), ['tests/a.test.mjs', 'web/src/lib/api.ts', 'web/src/pages/A.tsx', 'web/src/pages/B.tsx']);
  assert.deepEqual(n.out, []);
  assert.deepEqual([n.lane, n.container, n.community, n.communityName], ['lib', 'web', 2, 'api.ts']);
  assert.deepEqual(neighbors(ARCH, 'module:web/src/pages/A.tsx').out.sort(), ['web/src/lib/api.ts', 'web/src/lib/util.ts']);
  assert.deepEqual(neighbors(ARCH, '없는 노드'), { id: '없는 노드', lane: null, container: null, community: null, communityName: null, in: [], out: [], violations: [], flows: [] });
  assert.deepEqual(neighbors(ARCH, 'web/src/pages/A.tsx').flows, ['f1']);
  assert.deepEqual(neighbors(ARCH, 'app/server.mjs').violations.map((v) => [v.code, v.at.line]), [['architecture.layer-violation', 4]]);
});

test('SC-22·SC-24 communityLayout 구역 배치: 구역은 부품 순서, 구역 안은 묶음 id 순, 입력 순서를 뒤집어도 같다', () => {
  const a = communityLayout(ARCH, { hideTests: true });
  assert.deepEqual(a.zones.map((z) => z.id), ['web', 'bff', 'db']);
  assert.deepEqual(a.boxes.map((b) => b.id), [1, 2, 3, 5]);
  // 같은 구역 상자는 그 구역 상자 안에 든다
  for (const b of a.boxes) {
    const z = a.zones.find((x) => x.id === b.zone);
    assert.ok(b.x >= z.x && b.x + b.w <= z.x + z.w && b.y >= z.y && b.y + b.h <= z.y + z.h, `${b.id} 가 구역 ${z.id} 밖`);
  }
  const rev = clone(ARCH);
  rev.communities.reverse(); rev.communityLinks.reverse();
  assert.deepEqual(communityLayout(rev, { hideTests: true }), a);
  assert.deepEqual(communityLayout(ARCH, { hideTests: true }), a);
  // 기본값은 자료가 보이라고 한 묶음을 모두 그린다(부모 재현이 이 값을 묶음 수와 맞춘다)
  assert.equal(communityLayout(ARCH, {}).boxes.length, ARCH.communities.filter((c) => c.visible).length);
  assert.deepEqual(communityLayout(rev, {}), communityLayout(ARCH, {}));
});

test('SC-22 communityLayout 집계: 검사 묶음을 숨기면 그 선은 그리지 않고 상자 라벨 수로만 남는다', () => {
  const a = communityLayout(ARCH, { hideTests: true });
  assert.equal(a.hidden.length, 1);
  assert.deepEqual(a.lines.map((l) => [l.from, l.to, l.n]), [[1, 2, 3], [2, 1, 1], [2, 3, 2], [3, 5, 4]]);
  assert.equal(a.boxes.find((b) => b.id === 1).hiddenN, 6);
  assert.equal(a.boxes.find((b) => b.id === 2).hiddenN, 1);
  assert.equal(a.boxes.find((b) => b.id === 3).hiddenN, 0);
  // 검사 묶음을 켜면 상자 다섯과 구역 「구역 없음」이 선다
  const on = communityLayout(ARCH, {});
  assert.deepEqual(on.boxes.map((b) => b.id), [1, 2, 3, 5, 4]);
  assert.equal(on.zones.length, 4);
  assert.equal(on.lines.length, 6);
  // 짝 집계는 두 방향을 한 선으로 합친다
  const pair = communityLayout(ARCH, { hideTests: true, edges: 'pair' });
  assert.deepEqual(pair.lines.map((l) => [l.from, l.to, l.n, l.both]), [[1, 2, 4, true], [2, 3, 2, false], [3, 5, 4, false]]);
});

test('SC-22 communityLayout 드문 선 숨김(OQ-11 결정 focus): 기본은 끄고, 켜면 문턱이 짝별 건수의 중위값이며 숨긴 수가 남는다', () => {
  // 기본값: 선을 하나도 감추지 않는다. 무엇을 감출지는 보는 사람이 정한다
  const off = communityLayout(ARCH, { hideTests: true, edges: 'pair' });
  assert.deepEqual([off.cut, off.thinHidden, off.lines.length, off.allLines.length], [0, 0, 3, 3]);
  // 켜면 문턱은 중위값이다. 건수 [2, 4, 4] 의 중위는 4 라 2건짜리 한 선이 숨는다
  const on = communityLayout(ARCH, { hideTests: true, edges: 'pair', thin: true });
  assert.equal(on.cut, 4);
  assert.deepEqual(on.lines.map((l) => [l.from, l.to, l.n]), [[1, 2, 4], [3, 5, 4]]);
  assert.equal(on.thinHidden, 1);
  assert.equal(on.lines.length + on.thinHidden, on.allLines.length);
  // 문턱은 자료가 정한다. 건수가 다른 자료면 문턱도 달라진다
  const other = clone(ARCH);
  other.communityLinks = [{ from: 1, to: 2, n: 1, kinds: {} }, { from: 2, to: 3, n: 9, kinds: {} }, { from: 3, to: 5, n: 30, kinds: {} }];
  assert.equal(communityLayout(other, { hideTests: true, edges: 'pair', thin: true }).cut, 9);
});

test('SC-8 foldByCommunity: 노드를 묶음 단위로 접고 묶음 id 순, 묶음 없는 노드는 마지막 한 묶음이다', () => {
  const folded = foldByCommunity([
    { id: 'b', community: 2, communityName: 'api.ts' }, { id: 'a', community: 1, communityName: 'A.tsx' },
    { id: 'c', community: 2, communityName: 'api.ts' }, { id: 'd', community: null, communityName: null },
  ]);
  assert.deepEqual(folded.map((g) => [g.community, g.name, g.n, g.ids]), [
    [1, 'A.tsx', 1, ['a']], [2, 'api.ts', 2, ['b', 'c']], [null, '묶음 없음', 1, ['d']],
  ]);
  assert.deepEqual(foldByCommunity([]), []);
});

test('SC-7·SC-14 flowPath: 길의 층별 노드와 선언 좌표 사슬, 끊긴 자리를 낸다', () => {
  const f = flowPath(ARCH, 'f1');
  assert.deepEqual([f.id, f.name, f.status, f.container], ['f1', '결제', 'live', 'web']);
  assert.deepEqual(f.byLane.map((g) => [g.lane, g.nodes.length]), [['screen', 1], ['pages', 1], ['lib', 1], ['api', 1], ['function', 1], ['table', 1]]);
  assert.deepEqual(f.chain.map((e) => [e.from, e.to, e.broken]), [['screen:/pay', 'api:/api/pay', false], ['api:/api/pay', 'function:pay', false], ['function:pay', 'table:t.payments', false]]);
  assert.equal(flowPath(ARCH, '없는 기능'), null);
  const broken = clone(ARCH);
  broken.flows[0].broken = [{ at: 1, reason: '변수를 넘기는 호출' }];
  assert.equal(flowPath(broken, 'f1').chain[1].broken, true);
});

// ---- P3-14b: 엔진이 더하는 두 필드(architecture.flows[].edges · architecture.lanes[].members)를 화면이 읽는다.
// 기능을 고르면 실측 선을 그리고, 화면 경로·API·로그인·DB 함수·테이블 층이 상자를 얻는다.
// lanes[].nodes 는 지금처럼 숫자(그 층의 노드 수)로 두고 목록은 새 이름 members 다(LANE_NODES_FIELD=members).
// 두 필드가 없는 옛 자료에서도 지금 동작 그대로여야 한다(화면이 깨지지 않고 "왜 비었는지" 문구로 떨어진다) ----
const LN = (id, kind, label, community = null, part = null) => ({ id, kind, label, community, part });
// 같은 ARCH 에 두 필드만 얹는다. 층 노드 id 는 flows[].nodes 와 같은 id 공간(kind:id)이고 nodes 숫자는 건드리지 않는다
function withEngineFields(base = ARCH) {
  const a = clone(base);
  for (const l of a.lanes) {
    if (l.id === 'screen') l.members = [LN('screen:/pay', 'screen', '/pay', null, 'web')];
    if (l.id === 'api') l.members = [LN('api:/api/pay', 'api', 'POST /api/pay', null, 'bff')];
    if (l.id === 'function') l.members = [LN('function:pay', 'function', 'pay', 5, 'db')];
    if (l.id === 'table') l.members = [LN('table:t.payments', 'table', 't.payments', 5, 'db')];
  }
  a.flows[0].edges = [
    { from: 'screen:/pay', to: 'module:web/src/pages/A.tsx', kind: 'renders' },
    { from: 'module:web/src/pages/A.tsx', to: 'module:web/src/lib/api.ts', kind: 'imports' },
    { from: 'module:web/src/lib/api.ts', to: 'api:/api/pay', kind: 'calls' },
    { from: 'api:/api/pay', to: 'function:pay', kind: 'invokes' },
    { from: 'function:pay', to: 'table:t.payments', kind: 'touches' },
    { from: 'api:/api/pay', to: 'auth:없는노드', kind: 'auth' },
  ];
  return a;
}

test('SC-7 laneLayout 기능 실측 선: flows[].edges 를 그리고 선언 좌표 사슬과 구분한다', () => {
  const A = withEngineFields();
  const g = laneLayout(A, { mode: 'nodes', focus: 'sys', flow: 'f1' });
  const measured = g.lines.filter((l) => l.kind === 'flowEdge');
  // 여섯 중 끝점이 화폭에 없는 한 줄(auth:없는노드)은 빼고 다섯이 선다
  // 끝점의 module: 접두는 떼고 그린다(파일 노드의 화폭 id 는 경로 그대로다)
  assert.deepEqual(measured.map((l) => `${l.from}>${l.to}`).sort(), [
    'api:/api/pay>function:pay', 'function:pay>table:t.payments',
    'screen:/pay>web/src/pages/A.tsx', 'web/src/lib/api.ts>api:/api/pay',
    'web/src/pages/A.tsx>web/src/lib/api.ts',
  ].sort());
  assert.deepEqual([...new Set(measured.map((l) => l.relation))].sort(), ['calls', 'imports', 'invokes', 'renders', 'touches']);
  // 선언 좌표 사슬은 그대로 남고 종류가 다르다
  const declared = g.lines.filter((l) => l.kind === 'flow');
  assert.ok(declared.length > 0, '선언 사슬이 남아야 한다');
  assert.equal(declared.every((l) => l.declared === true), true);
  assert.equal(measured.every((l) => l.declared === false), true);
  // 필드가 없으면 지금처럼 선언 사슬만 그린다
  const old = laneLayout(ARCH, { mode: 'nodes', focus: 'sys', flow: 'f1' });
  assert.equal(old.lines.filter((l) => l.kind === 'flowEdge').length, 0);
  assert.equal(old.lines.filter((l) => l.kind === 'flow').length, declared.length);
});

test('SC-6 laneLayout 층 노드: lanes[].members 로 다섯 층이 상자를 얻고 없으면 빈 채로 둔다', () => {
  const A = withEngineFields();
  const g = laneLayout(A, { mode: 'nodes', focus: 'sys' });
  const byLane = Object.fromEntries(g.boxes.map((b) => [b.id, b.lane]));
  assert.equal(byLane['screen:/pay'], 'screen');
  assert.equal(byLane['api:/api/pay'], 'api');
  assert.equal(byLane['function:pay'], 'function');
  assert.equal(byLane['table:t.payments'], 'table');
  // 상자 이름은 label 을 쓰고 묶음·부품을 함께 싣는다
  const fn = g.boxes.find((b) => b.id === 'function:pay');
  assert.deepEqual([fn.name, fn.kind, fn.community, fn.container], ['pay', 'function', 5, 'db']);
  // 층 초점으로도 그 층의 상자만 선다
  const only = laneLayout(A, { mode: 'nodes', focus: 'group:function' });
  assert.deepEqual(only.boxes.map((b) => b.id), ['function:pay']);
  // 옛 자료(members 없음)는 그 다섯 층이 빈 채로 남는다
  assert.deepEqual(laneLayout(ARCH, { mode: 'nodes', focus: 'group:function' }).boxes, []);
  // 층 요약의 노드 수는 lanes[].nodes 숫자 그대로이고 members 를 얹어도 바뀌지 않는다
  assert.equal(laneLayout(A, {}).boxes.find((b) => b.id === 'function').n, 1);
  assert.equal(laneLayout(ARCH, {}).boxes.find((b) => b.id === 'function').n, 1);
  assert.deepEqual(laneLayout(A, {}), laneLayout(ARCH, {}));
});

test('SC-6·SC-7 laneLayout 층 노드 배치 결정성: 같은 입력이면 같은 좌표이고 입력 순서를 뒤집어도 같다', () => {
  const A = withEngineFields();
  const opts = { mode: 'nodes', focus: 'sys', flow: 'f1' };
  assert.deepEqual(laneLayout(A, opts), laneLayout(A, opts));
  const rev = clone(A);
  for (const l of rev.lanes) if (Array.isArray(l.members)) l.members.reverse();
  rev.flows[0].edges.reverse();
  rev.flows[0].nodes.reverse();
  assert.deepEqual(laneLayout(rev, opts), laneLayout(A, opts));
});

test('SC-6 laneLayout 묶음 단위 접기: 한 열이 foldMax 를 넘으면 묶음 상자로 접고 무엇이 접혔는지 남긴다', () => {
  const A = withEngineFields();
  // DB 함수 층에 묶음 둘에 나뉜 노드 30개를 둔다
  const fnLane = A.lanes.find((l) => l.id === 'function');
  fnLane.members = Array.from({ length: 30 }, (_, i) =>
    LN(`function:f${String(i).padStart(2, '0')}`, 'function', `f${i}`, i < 18 ? 5 : 3, 'db'));
  fnLane.nodes = 30;
  const wide = laneLayout(A, { mode: 'nodes', focus: 'group:function', foldMax: 40 });
  assert.equal(wide.boxes.length, 30);
  assert.equal(wide.folded, 0);
  const tight = laneLayout(A, { mode: 'nodes', focus: 'group:function', foldMax: 10 });
  // 묶음 둘로 접힌다. 접은 상자는 묶음 id 순이고 담은 수를 갖는다
  assert.deepEqual(tight.boxes.map((b) => [b.id, b.n, b.folded]), [['fold:function:3', 12, true], ['fold:function:5', 18, true]]);
  assert.equal(tight.folded, 30);
  assert.equal(tight.boxes[0].members.length, 12);
  // 접은 상자를 누르면 그 묶음으로 간다
  assert.equal(tight.boxes[0].focusTo, 'community:3');
  assert.deepEqual(laneLayout(A, { mode: 'nodes', focus: 'group:function', foldMax: 10 }), tight);
  // 묶음이 하나뿐이면 접지 않는다. 상자 하나 뒤에 열 전체가 숨고 눌러도 같은 열이 다시 접혀 빠져나갈 자리가 없다
  const one = clone(A);
  for (const x of one.lanes.find((l) => l.id === 'function').members) x.community = 5;
  const kept = laneLayout(one, { mode: 'nodes', focus: 'group:function', foldMax: 10 });
  assert.equal(kept.folded, 0);
  assert.equal(kept.boxes.length, 30);
  assert.equal(kept.boxes.every((b) => !b.folded), true);
});

test('SC-7 neighbors: 층 노드와 기능 실측 선의 1홉 이웃도 낸다', () => {
  const A = withEngineFields();
  const n = neighbors(A, 'api:/api/pay');
  assert.deepEqual(n.in.sort(), ['web/src/lib/api.ts']);
  assert.deepEqual(n.out.sort(), ['auth:없는노드', 'function:pay']);
  assert.deepEqual([n.lane, n.container, n.flows], ['api', 'bff', ['f1']]);
  // 모듈 노드는 의존과 실측 선을 합쳐 낸다
  const m = neighbors(A, 'web/src/lib/api.ts');
  assert.ok(m.out.includes('web/src/lib/util.ts'), '기존 의존이 남는다');
  assert.ok(m.out.includes('api:/api/pay'), '실측 선이 더해진다');
  // 필드가 없으면 지금 그대로다
  assert.deepEqual(neighbors(ARCH, 'web/src/lib/api.ts').out, ['web/src/lib/util.ts']);
});
