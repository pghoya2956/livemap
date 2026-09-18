// 어댑터 조각(badge): 프로젝트 어댑터가 개요 요약 줄에 한 조각을 얹는다.
// 엔진은 글자로만 다루고 뜻은 어댑터가 정한다. 길이·모양만 엔진이 지킨다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Graph, runAdapter } from '../src/lib/graph.mjs';
import { summaryLine } from '../src/derive.mjs';

const base = {
  summary: { stepsLive: 2, stepsTotal: 3, liveRoutes: 1, routes: 2, commits: 5, warnings: 1, fixedRoutes: 0 },
  roadmap: [], ledger: { running: [], waiting: [] }, deploy: null,
};

test('요약 줄은 경고 뒤에 어댑터 조각을 순서대로 붙인다', () => {
  const line = summaryLine({ ...base, badges: [{ label: '빚과 어긋남', text: '미선언 0 · 직접 goto 37' }] });
  assert.match(line, /경고 1 · 빚과 어긋남 미선언 0 · 직접 goto 37/);
});

test('조각이 없으면 1.x 줄 그대로다', () => {
  assert.equal(summaryLine({ ...base, badges: [] }), summaryLine(base));
});

test('badge는 줄바꿈을 접고 60자에서 자르며 빈 글자를 막는다', () => {
  const g = new Graph();
  runAdapter(g, 'parity', (gg) => {
    gg.badge('빚', '가'.repeat(80));
    gg.badge('대장', '미선언 0\n  관계없음 3');
    return null;
  });
  assert.equal(g.badges[0].text.length, 60);
  assert.equal(g.badges[1].text, '미선언 0 관계없음 3');
  assert.equal(g.badges[0].adapter, 'parity');

  const bad = new Graph();
  runAdapter(bad, 'x', (gg) => { gg.badge('빈', '   '); return null; });
  assert.equal(bad.adapters[0].status, 'failed', '빈 조각은 그 어댑터만 failed');
});
