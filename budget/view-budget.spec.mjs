// 화면 예산 검사: 첫 화면(개요)이 단순함 규칙을 지키는지 잰다. 어기면 CI가 실패한다.
//   CSP 아래 오류 0(바탕 --bg) · 1440×900에서 스크롤 없음 · 패널 8 이하 · 목록 묶음마다 6행 이하 · 기능 지도 12행 이하
//   · 내비 5가 모두 보임 · #root 글자에 시스템 식별자 0 · 기능 지도 선택 → a.open → 단계 카드 → 단계 상세 3번 안
//   · 패널 숨은 스크롤 0 · 모션 줄임에서 애니메이션 0 · 범례 상태 모양 4종 구분 · 모션 줄임 스크린샷
// 임계값은 map/config.json의 budget(viewport·maxPanels·maxRowsPerPanel·navItems)이다.
// 1.3.0: 로드맵 화면 절(-g 로드맵)과 캡처 패널 절(-g 캡처)을 더한다. 로드맵은 개요 임계값을 물려받지 않고 개수 상한 없이 성질만 잰다.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 설정·스크린샷은 프로젝트 루트(cwd) 기준이다. 패키지 폴더 기준으로 쓰면 산출물이 node_modules 안에 생긴다.
const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'map/config.json'), 'utf8')).budget;
const IDENT = /\/api\/|\.tsx\b|\.mjs\b|\.sql\b|\bweb\/src\b|\b[0-9a-f]{7,40}\b/;

const openOverview = async (page) => {
  await page.goto('/map/#/overview');
  await page.waitForSelector('.panel', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
};

test('CSP 아래서 오류 없이 렌더된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  await openOverview(page);
  expect(errors, errors.join('\n')).toEqual([]);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(5, 7, 10)');
});

test('개요는 한 화면에 들어간다', async ({ page }) => {
  await openOverview(page);
  const [scrollH, clientH] = await page.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.clientHeight]);
  expect(scrollH, `스크롤 높이 ${scrollH} > 뷰포트 ${clientH}`).toBeLessThanOrEqual(clientH);
  const bodyW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyW).toBeLessThanOrEqual(cfg.viewport[0]);
});

test('패널·행·내비 수가 예산 안이고 내비가 모두 보인다', async ({ page }) => {
  await openOverview(page);
  expect(await page.locator('.panel').count()).toBeLessThanOrEqual(cfg.maxPanels);
  const nav = page.locator('.nav a');
  expect(await nav.count()).toBeLessThanOrEqual(cfg.navItems);
  for (let i = 0; i < await nav.count(); i += 1) await expect(nav.nth(i)).toBeVisible();
  const lists = page.locator('.panel[data-budget="list"]');
  for (let i = 0; i < await lists.count(); i += 1) {
    const rows = await lists.nth(i).locator('.row, .bar').count();
    // 한 패널에 목록 묶음(.rows)이 여럿이면 묶음마다 6행 이하로 본다.
    const groups = await lists.nth(i).locator('.rows, .bars').count();
    expect(rows, `패널 ${i} 행 ${rows}`).toBeLessThanOrEqual(cfg.maxRowsPerPanel * Math.max(1, groups));
  }
  const matrix = page.locator('.panel[data-budget="matrix"] .jrow');
  expect(await matrix.count()).toBeLessThanOrEqual(12);
});

test('첫 화면에는 시스템 식별자가 없다', async ({ page }) => {
  await openOverview(page);
  const text = await page.locator('#root').innerText();
  const hit = text.split('\n').find((l) => IDENT.test(l));
  expect(hit, `식별자 노출: ${hit}`).toBeUndefined();
});

test('기능 지도 선택 → a.open → 단계 상세까지 3번 안에 닿는다', async ({ page }) => {
  await openOverview(page);
  await page.locator('.jrow').first().click();
  await page.locator('a.open').click();
  await page.waitForSelector('.scene');
  await page.locator('.scene').first().click();
  await page.waitForSelector('.detail');
  expect(await page.locator('.detail .node').count()).toBeGreaterThan(0);
});

test('패널 숨은 스크롤이 없다', async ({ page }) => {
  await openOverview(page);
  // .panel·.pb·.rows와 패널 안 overflow-y auto/scroll 자손. 줄 수 제한 글자와 지도·캡처 상자는 뺀다.
  const hidden = await page.evaluate(() => {
    const set = new Set(document.querySelectorAll('.panel, .pb, .rows'));
    document.querySelectorAll('.panel *').forEach((e) => { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') set.add(e); });
    return [...set].filter((e) => !e.closest('.mapwrap, .live'))
      .filter((e) => { const c = getComputedStyle(e).webkitLineClamp; return !c || c === 'none'; })
      .filter((e) => e.scrollHeight - e.clientHeight > 1)
      .map((e) => `${e.className} ${e.closest('.panel')?.querySelector('h2')?.textContent || ''} +${e.scrollHeight - e.clientHeight}px`);
  });
  expect(hidden, hidden.join('\n')).toEqual([]);
});

test('범례 상태 모양 4종이 서로 다르다', async ({ page }) => {
  await openOverview(page);
  test.skip(await page.locator('.layers svg.stepmark').count() === 0, '기능이 없어 범례가 없다');
  // 동작 = 채운 원(테두리 없음), 목업 = 반원 채움 + 실선, 계획 = 채움 없음 + 실선, 구상 = 채움 없음 + 점선
  const kinds = await page.evaluate(() => {
    const WORD = { 동작: 'live', 목업: 'mock', 계획: 'planned', 구상: 'next' };
    return [...document.querySelectorAll('.layers svg.stepmark')].map((svg) => {
      const word = Object.keys(WORD).find((w) => (svg.closest('button')?.textContent || '').includes(w));
      const shapes = [...svg.querySelectorAll('circle, path')].map((s) => { const cs = getComputedStyle(s); return { tag: s.tagName, fill: cs.fill !== 'none' && cs.fillOpacity !== '0', stroke: cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0, dash: cs.strokeDasharray !== 'none' }; });
      const filledCircle = shapes.some((x) => x.tag === 'circle' && x.fill && !x.stroke);
      const filledPath = shapes.some((x) => x.tag === 'path' && x.fill);
      const solid = shapes.some((x) => x.stroke && !x.dash), dashed = shapes.some((x) => x.stroke && x.dash);
      const kind = filledCircle && !solid && !dashed ? 'live' : filledPath && solid ? 'mock' : dashed ? 'next' : solid ? 'planned' : 'unknown';
      return { word, expect: WORD[word], kind };
    });
  });
  expect(kinds.filter((k) => k.expect).length, JSON.stringify(kinds)).toBe(4);
  for (const k of kinds.filter((x) => x.expect)) expect(k.kind, `${k.word} 표식`).toBe(k.expect);
});

test.describe('모션 줄임', () => {
  test.use({ reducedMotion: 'reduce' });

  test('모션 줄임에서 애니메이션이 없다', async ({ page }) => {
    await openOverview(page);
    await page.waitForTimeout(500);
    const names = await page.evaluate(() => document.getAnimations().map((a) => a.animationName || a.constructor.name));
    expect(names, names.join(', ')).toEqual([]);
  });

  test('개요 스크린샷(모션 줄임)', async ({ page }) => {
    await openOverview(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(process.cwd(), 'map/.out/overview-1440.png') });
  });
});

// ---- 로드맵 화면(1.3.0, DEC-26·DEC-44): 개요 임계값을 물려받지 않고 개수 상한 없이 성질만 잰다. data.roadmap이 비면 건너뛴다 ----
// 기대값은 data.json에서 이 파일 안에서 계산한다(패키지에 ui/가 없어 화면 모듈을 부르지 못한다). 규칙은 ui/lib/tree.js와 같다:
// 있는 선행만 선, 잠김 = 완료·진행이 아니고 선행 중 미완, 고른 길 = 고른 항목과 조상끼리·고른 항목과 자손끼리의 선.
const loadData = (page) => page.evaluate(() => fetch('data/data.json', { cache: 'no-store' }).then((r) => r.json()));
const openRoadmap = async (page, hash = '#/roadmap') => {
  await page.goto(`/map/${hash}`);
  await page.waitForSelector('[data-screen="roadmap"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  return loadData(page);
};
function roadmapModel(d) {
  const items = [...d.roadmap].sort((a, b) => a.order - b.order);
  const byId = new Map(items.map((m) => [m.id, m]));
  const deps = new Map(items.map((m) => [m.id, [...new Set((m.deps || []).map((x) => (typeof x === 'string' ? x : x.id)))].filter((x) => byId.has(x))]));
  const children = new Map(items.map((m) => [m.id, []]));
  for (const m of items) for (const x of deps.get(m.id)) children.get(x).push(m.id);
  const edges = items.flatMap((m) => deps.get(m.id).map((x) => `${x}>${m.id}`));
  const locked = items.filter((m) => !['완료', '진행'].includes(m.status) && deps.get(m.id).some((x) => byId.get(x).status !== '완료'));
  const reach = (id, next) => { const seen = new Set(); const st = [...next.get(id)]; while (st.length) { const x = st.pop(); if (x === id || seen.has(x)) continue; seen.add(x); st.push(...next.get(x)); } return seen; };
  const pathEdges = (id) => {
    const up = new Set([id, ...reach(id, deps)]), down = new Set([id, ...reach(id, children)]);
    return edges.filter((e) => { const [a, b] = e.split('>'); return (up.has(a) && up.has(b)) || (down.has(a) && down.has(b)); });
  };
  return { items, byId, deps, children, edges, locked, pathEdges };
}

test.describe('로드맵 화면', () => {
  test('SC-1·SC-2 로드맵: CSP 아래 오류 없이 노드 수·선 수가 자료와 같고 같은 열은 같은 x에 선다', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
    const d = await openRoadmap(page);
    test.skip(!(d.roadmap || []).length, '로드맵 항목이 없다');
    await page.waitForSelector('.rt-node');
    const M = roadmapModel(d);
    expect(await page.locator('.rt-node').count(), '노드 수').toBe(M.items.length);
    expect((await page.$$eval('.rt-edge', (es) => es.map((e) => e.dataset.edge))).sort(), '선').toEqual([...M.edges].sort());
    // 열(.rt-col)마다 노드의 왼쪽 x가 하나이고 열끼리는 다르다
    const cols = await page.$$eval('.rt-col', (cs) => cs.map((c) => [...new Set([...c.querySelectorAll('.rt-node')].map((n) => Math.round(n.getBoundingClientRect().left)))]));
    for (const [i, xs] of cols.entries()) expect(xs.length, `열 ${i} 노드 x ${xs}`).toBeLessThanOrEqual(1);
    const xs = cols.filter((c) => c.length).map((c) => c[0]);
    expect(new Set(xs).size, '열끼리 x가 겹친다').toBe(xs.length);
    const left = Object.fromEntries(await page.$$eval('.rt-node', (ns) => ns.map((n) => [n.dataset.id, n.getBoundingClientRect().left])));
    if (!(d.milestones || []).length) {
      // 층 모드: 선행은 항목보다 왼쪽 열이다(순환 선은 뺀다)
      const cyc = new Set(await page.$$eval('.rt-edge.is-cyc', (es) => es.map((e) => e.dataset.edge)));
      for (const e of M.edges.filter((x) => !cyc.has(x))) { const [a, b] = e.split('>'); expect(left[a], `${e} 선행이 오른쪽`).toBeLessThan(left[b]); }
    } else {
      // 마일스톤 모드: 같은 마일스톤(목록에 없는 id는 미배정 하나로) 항목은 같은 열이다
      const known = new Set(d.milestones.map((m) => m.id));
      const group = new Map();
      for (const m of M.items) { const k = known.has(m.milestone) ? m.milestone : ''; group.set(k, [...(group.get(k) || []), Math.round(left[m.id])]); }
      for (const [k, ls] of group) expect(new Set(ls).size, `마일스톤 ${k || '없음'} 열이 갈림`).toBe(1);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('SC-3 로드맵: 잠긴 노드 이름에 "잠김"과 막는 선행 제목이 있다', async ({ page }) => {
    const d = await openRoadmap(page);
    test.skip(!(d.roadmap || []).length, '로드맵 항목이 없다');
    await page.waitForSelector('.rt-node');
    const M = roadmapModel(d);
    const names = Object.fromEntries(await page.$$eval('.rt-node', (ns) => ns.map((n) => [n.dataset.id, n.getAttribute('aria-label') || ''])));
    expect(Object.values(names).filter((n) => n.includes('잠김')).length, '잠김 수').toBe(M.locked.length);
    for (const m of M.locked) {
      const blocking = M.deps.get(m.id).filter((x) => M.byId.get(x).status !== '완료');
      for (const x of blocking) expect(names[m.id], `${m.id} 이름에 선행 ${x}`).toContain(M.byId.get(x).title);
    }
  });

  test('SC-4 로드맵: 노드를 누르면 그 항목의 조상·자손 사이 선만 밝아지고 카드가 문서에 하나다', async ({ page }) => {
    const d = await openRoadmap(page);
    test.skip(!(d.roadmap || []).length, '로드맵 항목이 없다');
    await page.waitForSelector('.rt-node');
    const M = roadmapModel(d);
    // 선이 가장 많이 켜지는 항목을 고른다(선이 없으면 첫 항목)
    const pick = [...M.items].sort((a, b) => M.pathEdges(b.id).length - M.pathEdges(a.id).length)[0];
    await page.locator(`.rt-node[data-id="${pick.id}"]`).click();
    await page.waitForFunction((id) => location.hash === `#/roadmap/${id}`, pick.id);
    // 해시가 바뀐 뒤 화면이 다시 그려질 때까지 기다린다(고른 노드에 .sel)
    await expect(page.locator(`.rt-node.sel[data-id="${pick.id}"]`)).toHaveCount(1);
    const on = await page.$$eval('.rt-edge.on', (es) => es.map((e) => e.dataset.edge));
    expect(on.sort()).toEqual([...M.pathEdges(pick.id)].sort());
    expect(await page.locator(`[id="rm-${pick.id}"]`).count(), 'rm-<id> 유일').toBe(1);
  });

  test('로드맵: 노드가 뷰포트나 트리 상자 가로 스크롤 안에 있고 트리 상자에 세로 숨은 스크롤이 없다', async ({ page }) => {
    const d = await openRoadmap(page);
    test.skip(!(d.roadmap || []).length, '로드맵 항목이 없다');
    await page.waitForSelector('.rt-node');
    const outside = await page.evaluate(() => {
      const box = document.querySelector('.rt-box'), b = box.getBoundingClientRect();
      const lo = b.left - box.scrollLeft - 1, hi = b.left - box.scrollLeft + box.scrollWidth + 1;
      return [...document.querySelectorAll('.rt-node')].filter((n) => { const r = n.getBoundingClientRect(); return !r.width || r.left < lo || r.right > hi; }).map((n) => n.dataset.id);
    });
    expect(outside, outside.join(', ')).toEqual([]);
    // 개요와 같은 식: 계산값이 auto·scroll이어도 실제 넘침이 1px 이하면 숨은 스크롤이 아니다(가로 스크롤 상자는 브라우저가 overflow-y를 auto로 올린다)
    const hidden = await page.evaluate(() => {
      const set = new Set(document.querySelectorAll('[data-screen="roadmap"] .panel'));
      document.querySelectorAll('[data-screen="roadmap"] .panel *').forEach((e) => { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') set.add(e); });
      return [...set].filter((e) => { const c = getComputedStyle(e).webkitLineClamp; return !c || c === 'none'; })
        .filter((e) => e.scrollHeight - e.clientHeight > 1).map((e) => `${e.className} +${e.scrollHeight - e.clientHeight}px`);
    });
    expect(hidden, hidden.join('\n')).toEqual([]);
  });

  test('SC-12 로드맵: Tab으로 첫 노드에 닿고 화살표 ←첫 선행 →첫 후속 ↑↓같은 열 이웃으로 옮긴다', async ({ page }) => {
    const d = await openRoadmap(page);
    test.skip(!(d.roadmap || []).length, '로드맵 항목이 없다');
    await page.waitForSelector('.rt-node');
    const M = roadmapModel(d);
    const first = await page.locator('.rt-node').first().getAttribute('data-id');
    let reached = null;
    for (let i = 0; i < 80 && !reached; i += 1) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.closest('.rt-node')?.dataset.id || null); }
    expect(reached, 'Tab으로 노드에 닿지 않는다').toBe(first);
    const column = Object.fromEntries((await page.$$eval('.rt-col', (cs) => cs.map((c) => [...c.querySelectorAll('.rt-node')].map((n) => n.dataset.id)))).flatMap((ids) => ids.map((id, i) => [id, [ids[i - 1], ids[i + 1]]])));
    const expectMove = (id, key) => ({ ArrowLeft: M.deps.get(id)[0], ArrowRight: M.children.get(id)[0], ArrowUp: column[id][0], ArrowDown: column[id][1] }[key] ?? id);
    // 네 방향이 모두 움직이는 항목이 있으면 그것, 없으면 가장 많이 움직이는 항목
    const score = (id) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].filter((k) => expectMove(id, k) !== id).length;
    const from = [...M.items].map((m) => m.id).sort((a, b) => score(b) - score(a))[0];
    const moved = [];
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      await page.locator(`.rt-node[data-id="${from}"]`).focus();
      await page.keyboard.press(key);
      const now = await page.evaluate(() => document.activeElement?.dataset.id);
      expect(now, `${from} ${key}`).toBe(expectMove(from, key));
      if (now !== from) moved.push(key);
    }
    if (M.items.length > 1) expect(moved.length, '화살표로 움직인 방향이 없다').toBeGreaterThan(0);
  });

  test.describe('모션 줄임', () => {
    test.use({ reducedMotion: 'reduce' });
    test('로드맵: 모션 줄임에서 애니메이션이 없다', async ({ page }) => {
      const d = await openRoadmap(page);
      test.skip(!(d.roadmap || []).length, '로드맵 항목이 없다');
      await page.waitForSelector('.rt-node');
      await page.locator('.rt-node').first().click();
      await page.waitForTimeout(300);
      const names = await page.evaluate(() => document.getAnimations().map((a) => a.animationName || a.constructor.name));
      expect(names, names.join(', ')).toEqual([]);
    });
  });
});

// ---- 캡처 패널(1.3.0, DEC-24·DEC-38~DEC-40·DEC-52): 누르기 전 5장 이하, 누른 기능 캡처만, 없으면 빈 상태, 범위를 바꾸면 1장째 ----
test.describe('캡처 패널', () => {
  test.use({ reducedMotion: 'reduce' });
  const overviewData = (page) => page.evaluate(() => fetch('data/overview.json', { cache: 'no-store' }).then((r) => r.json()));
  const count = (o, id) => o.captures.filter((c) => c.journey === id).length;
  const row = (page, o, id) => page.locator(`.jrow[aria-label^=${JSON.stringify(o.journeys.find((j) => j.id === id).title)}]`).first();

  test('SC-14 캡처: 누르기 전 썸네일은 5장 이하다', async ({ page }) => {
    await openOverview(page);
    const o = await overviewData(page);
    test.skip(!o.captures.length, '캡처가 없다');
    expect(await page.locator('.capture .thumbs button').count()).toBeLessThanOrEqual(5);
  });

  test('SC-7·SC-8 캡처: 기능을 누르면 그 기능 캡처만 돌고, 캡처가 없는 기능은 "캡처 없음"', async ({ page }) => {
    await openOverview(page);
    const o = await overviewData(page);
    const onMap = new Set(await page.$$eval('.jrow', (rs) => rs.map((r) => r.getAttribute('aria-label') || '')));
    const shown = o.journeys.filter((j) => [...onMap].some((l) => l.startsWith(j.title)));
    const withCaps = shown.filter((j) => count(o, j.id) > 0).sort((a, b) => count(o, b.id) - count(o, a.id))[0];
    const without = shown.find((j) => count(o, j.id) === 0);
    test.skip(!withCaps && !without, '지도에 누를 기능이 없다');
    if (withCaps) {
      await row(page, o, withCaps.id).click();
      await expect(page.locator('.capture .thumbs button')).toHaveCount(count(o, withCaps.id));
      await expect(page.locator('.capture .cnt')).toHaveText(new RegExp(`^1/${count(o, withCaps.id)}$`));
    }
    if (without) {
      await row(page, o, without.id).click();
      await expect(page.locator('.capture .live')).toContainText('캡처 없음');
      await expect(page.locator('.capture .thumbs button')).toHaveCount(0);
    }
  });

  test('DEC-39 캡처: 범위를 바꾸면 장 번호가 1로 돌아간다', async ({ page }) => {
    await openOverview(page);
    const o = await overviewData(page);
    const onMap = new Set(await page.$$eval('.jrow', (rs) => rs.map((r) => r.getAttribute('aria-label') || '')));
    const many = o.journeys.filter((j) => [...onMap].some((l) => l.startsWith(j.title)) && count(o, j.id) >= 2);
    test.skip(many.length < 1 || o.journeys.filter((j) => count(o, j.id) > 0).length < 2, '캡처 2장 이상 기능과 다른 캡처 기능이 필요하다');
    const a = many[0];
    const b = o.journeys.find((j) => j.id !== a.id && count(o, j.id) > 0 && [...onMap].some((l) => l.startsWith(j.title)));
    test.skip(!b, '두 번째로 누를 캡처 기능이 지도에 없다');
    await row(page, o, a.id).click();
    await page.locator('.capture .thumbs button').nth(1).click();
    await expect(page.locator('.capture .cnt')).toHaveText(/^2\//);
    await row(page, o, b.id).click();
    await expect(page.locator('.capture .cnt')).toHaveText(new RegExp(`^1/${count(o, b.id)}$`));
  });
});
