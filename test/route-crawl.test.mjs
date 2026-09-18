// 크롤러 회귀 검사: 개요에서 하위 화면으로 가면 화면이 data/data.json을 받는 동안 「불러오는 중…」(.boot)만 있고 [data-screen]이 없다.
// 크롤러가 그 사이에 재면 화면 없음·개체 없음으로 틀린다(재빌드 serve는 자료 요청마다 5초 지나면 빌드를 먼저 해서 응답이 수 초 늦다).
// data.json 응답을 늦춰 그 조건을 고정하고, 해시 방문(visitHash)과 개요 이동 요소 판정(checkOverviewTarget)이 화면이 그려진 뒤에 재는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/cli.mjs';
import { serve } from '../src/serve.mjs';
import { launchBrowser, openCrawlContext, fetchJson, buildRouteIndex, visitHash, checkOverviewTarget } from '../scripts/route-crawl.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGETS = join(HERE, '..', 'scripts', 'click-targets.json');
const DELAY = 1200; // 크롤러의 잠잠함 창(200ms)보다 충분히 길다

let dir, server, browser, page, log, ctx, served, targets, base;
test.before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'livemap 크롤러 검사-'));
  const root = join(dir, 'mini'), out = join(dir, 'out');
  cpSync(join(HERE, 'fixtures', 'mini'), root, { recursive: true });
  await build(root, out);
  // 재빌드 serve와 같은 배치. 빌드는 이미 했으므로 요청 때의 빌드는 비워 둔다(늦춤은 아래 page.route가 맡는다)
  const say = console.log; console.log = () => {};
  try { server = serve({ root, out, port: 0, captures: join(root, 'map/captures'), build: async () => {} }); await new Promise((r) => server.once('listening', r)); } finally { console.log = say; }
  base = `http://127.0.0.1:${server.address().port}/map/`;
  served = await fetchJson(`${base}data/overview.json`);
  const data = await fetchJson(`${base}data/data.json`);
  targets = JSON.parse(readFileSync(TARGETS, 'utf8'));
  ctx = buildRouteIndex(targets, [{ name: 'data.json', data }, { name: 'overview.json', data: served }]);
  browser = await launchBrowser(base);
  ({ page, log } = await openCrawlContext(browser, { generatedAt: served.generatedAt }));
  await page.route('**/data/data.json', async (route) => { await new Promise((r) => setTimeout(r, DELAY)); await route.continue(); });
});
test.after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r()));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('크롤러: 자료가 늦게 와도 해시 방문은 화면이 그려진 뒤에 잰다', async () => {
  await page.goto(base); await page.waitForSelector('.panel', { timeout: 15000 });
  const v = await visitHash(page, log, ctx, '#/roadmap/first');
  assert.equal(v.screenAttr, true, `화면 루트가 있어야 한다: ${JSON.stringify(v)}`);
  assert.deepEqual(v.screen, ['roadmap']);
  assert.equal(v.pass, true, JSON.stringify(v));
});

test('크롤러: 자료가 늦게 와도 개요 이동 요소 판정은 화면이 그려진 뒤에 잰다', async () => {
  const target = targets.overview.find((t) => t.name === '마일스톤 패널 항목·뒤 마일스톤 행');
  assert.ok(target, '표에 그 행이 있어야 한다');
  const r = await checkOverviewTarget(page, log, ctx, target, { base, served, overviewOnly: false, budgetSel: targets.clickBudget[0] });
  assert.ok(r.navigations?.length >= 1, `이동이 한 번은 있어야 한다: ${JSON.stringify(r)}`);
  for (const n of r.navigations) assert.equal(n.pass, true, JSON.stringify(n));
  assert.equal(r.screenAttrMissing, 0);
  assert.equal(r.pass, true, JSON.stringify(r.checks));
});
