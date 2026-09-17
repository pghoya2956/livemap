// 화면 순수 함수 검사(스펙 「테스트 계획」 화면 순수 함수): 신선도, 결정 대기 경과일, 시각 표기, 호스트 이름, 목록 맞춤,
// 기능 지도 12개 고르기, 마지막 방문 비교, 해시 라우트. JSX 없는 ui/lib 모듈만 import한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshness, waitDays, hm, mdKo, kst, hostOf } from '../ui/lib/format.js';
import { fitCount, mapJourneys } from '../ui/lib/fit.js';
import { isNewer } from '../ui/lib/visit.js';
import { parseRoute } from '../ui/lib/route.js';

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
  assert.deepEqual(r('#/roadmap'), ['roadmap', 2, { id: null }]);
  assert.deepEqual(r('#/roadmap/real-use-1'), ['roadmap', 2, { id: 'real-use-1' }]);
  assert.deepEqual(r('#/tasks'), ['tasks', 3, { task: null }]);
  assert.deepEqual(r('#/tasks/20260916-x'), ['tasks', 3, { task: '20260916-x' }]);
  assert.deepEqual(r('#/changes'), ['more', 4, { tab: 'changes', detail: null }]);
  assert.deepEqual(r('#/more'), ['more', 4, { tab: 'decisions', detail: null }]);
  for (const t of ['changes', 'decisions', 'screens', 'backend', 'tests', 'about']) assert.deepEqual(r(`#/more/${t}`), ['more', 4, { tab: t, detail: null }]);
  assert.deepEqual(r(`#/more/screens/${encodeURIComponent('/teams/:id')}`), ['more', 4, { tab: 'screens', detail: '/teams/:id' }]);
  for (const h of ['#/no-such-route', '#/more/nope', '#/journeys/a/b/c', '#/%E0%A4%A']) assert.deepEqual(r(h), ['overview', -1, {}]);
});
