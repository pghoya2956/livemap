// 화면 예산 검사: 첫 화면(개요)이 단순함 규칙을 지키는지 잰다. 어기면 CI가 실패한다.
//   1440×900에서 스크롤 없음 · 패널 8 이하 · 목록 패널 6행 이하 · 여정 매트릭스 12행 이하 · 시스템 식별자 0 · 내비 5
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 설정·스크린샷은 프로젝트 루트(cwd) 기준이다. 패키지 폴더 기준으로 쓰면 산출물이 node_modules 안에 생긴다.
const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'map/config.json'), 'utf8')).budget;
const IDENT = /\/api\/|\.tsx\b|\.mjs\b|\.sql\b|\bweb\/src\b|\b[0-9a-f]{7,40}\b/;

test('CSP 아래서 오류 없이 렌더된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/map/#/overview');
  await page.waitForSelector('.panel', { timeout: 10_000 });
  expect(errors, errors.join('\n')).toEqual([]);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.side')).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
});

test('개요는 한 화면에 들어간다', async ({ page }) => {
  await page.goto('/map/#/overview');
  await page.waitForSelector('.panel');
  const [scrollH, clientH] = await page.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.clientHeight]);
  expect(scrollH, `스크롤 높이 ${scrollH} > 뷰포트 ${clientH}`).toBeLessThanOrEqual(clientH);
  const bodyW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyW).toBeLessThanOrEqual(cfg.viewport[0]);
});

test('패널·행·내비 수가 예산 안이다', async ({ page }) => {
  await page.goto('/map/#/overview');
  await page.waitForSelector('.panel');
  expect(await page.locator('.panel').count()).toBeLessThanOrEqual(cfg.maxPanels);
  expect(await page.locator('.nav a').count()).toBeLessThanOrEqual(cfg.navItems);
  const lists = page.locator('.panel[data-budget="list"]');
  for (let i = 0; i < await lists.count(); i += 1) {
    const rows = await lists.nth(i).locator('.row, .bar').count();
    // 한 패널에 목록이 둘이면 각각 6행 이하로 본다(작업 6 + 다음 한 걸음 4, 변화 6 + 3).
    const groups = await lists.nth(i).locator('.rows, .bars').count();
    expect(rows, `패널 ${i} 행 ${rows}`).toBeLessThanOrEqual(cfg.maxRowsPerPanel * Math.max(1, groups));
  }
  const matrix = page.locator('.panel[data-budget="matrix"] .jrow');
  expect(await matrix.count()).toBeLessThanOrEqual(12);
});

test('첫 화면에는 시스템 식별자가 없다', async ({ page }) => {
  await page.goto('/map/#/overview');
  await page.waitForSelector('.panel');
  const text = await page.locator('.main').innerText();
  const hit = text.split('\n').find((l) => IDENT.test(l));
  expect(hit, `식별자 노출: ${hit}`).toBeUndefined();
});

test('여정 장면 상세까지 3번 안에 닿는다', async ({ page }) => {
  await page.goto('/map/#/overview');
  await page.waitForSelector('.jrow');
  await page.locator('.jrow').first().click();
  await page.waitForSelector('.scene');
  await page.locator('.scene').first().click();
  await page.waitForSelector('.detail');
  expect(await page.locator('.detail .node').count()).toBeGreaterThan(0);
});

test('개요 스크린샷', async ({ page }) => {
  await page.goto('/map/#/overview');
  await page.waitForSelector('.panel');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(process.cwd(), 'map/.out/overview-1440.png') });
});
