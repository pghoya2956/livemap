// 화면 예산 검사: 첫 화면(개요)이 단순함 규칙을 지키는지 잰다. 어기면 CI가 실패한다.
//   CSP 아래 오류 0(바탕 --bg) · 1440×900에서 스크롤 없음 · 패널 8 이하 · 목록 묶음마다 6행 이하 · 기능 지도 12행 이하
//   · 내비 5가 모두 보임 · #root 글자에 시스템 식별자 0 · 기능 지도 선택 → a.open → 단계 카드 → 단계 상세 3번 안
//   · 패널 숨은 스크롤 0 · 모션 줄임에서 애니메이션 0 · 범례 상태 모양 4종 구분 · 모션 줄임 스크린샷
// 임계값은 map/config.json의 budget(viewport·maxPanels·maxRowsPerPanel·navItems)이다.
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
