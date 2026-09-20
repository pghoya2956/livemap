// 크롤러 회귀 검사: 개요에서 하위 화면으로 가면 화면이 data/data.json을 받는 동안 「불러오는 중…」(.boot)만 있고 [data-screen]이 없다.
// 크롤러가 그 사이에 재면 화면 없음·개체 없음으로 틀린다(재빌드 serve는 자료 요청마다 5초 지나면 빌드를 먼저 해서 응답이 수 초 늦다).
// data.json 응답을 늦춰 그 조건을 고정하고, 해시 방문(visitHash)과 개요 이동 요소 판정(checkOverviewTarget)이 화면이 그려진 뒤에 재는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/cli.mjs';
import { execFileSync } from 'node:child_process';
import { serve, DATA_FILES } from '../src/serve.mjs';
import { launchBrowser, openCrawlContext, fetchJson, buildRouteIndex, visitHash, checkOverviewTarget, KNOWN_EXPECT, whenHolds, whenFacts, openScreen } from '../scripts/route-crawl.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGETS = join(HERE, '..', 'scripts', 'click-targets.json');
const DELAY = 1200; // 크롤러의 잠잠함 창(200ms)보다 충분히 길다

let dir, server, browser, page, log, ctx, served, targets, base, data;
test.before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'livemap 크롤러 검사-'));
  const root = join(dir, 'mini'), out = join(dir, 'out');
  cpSync(join(HERE, 'fixtures', 'mini'), root, { recursive: true });
  await build(root, out);
  // 화면은 ui/ 소스에서 바로 묶어 쓴다. 커밋된 site/ 를 쓰면 번들이 소스보다 낡았을 때 이 검사가 엉뚱하게 떨어진다
  // (site/ 는 통합 뒤 한 번만 다시 만든다). export 배치대로 site 폴더 하나에 화면과 data/ 를 모은다
  const siteDir = join(dir, 'site');
  execFileSync(process.execPath, [join(HERE, '..', 'scripts', 'build-ui.mjs'), siteDir], { stdio: 'ignore' });
  mkdirSync(join(siteDir, 'data'), { recursive: true });
  for (const f of DATA_FILES) cpSync(join(out, f), join(siteDir, 'data', f));
  const say = console.log; console.log = () => {};
  try { server = serve({ root, out, port: 0, captures: join(root, 'map/captures'), static: siteDir, build: async () => {} }); await new Promise((r) => server.once('listening', r)); } finally { console.log = say; }
  base = `http://127.0.0.1:${server.address().port}/map/`;
  served = await fetchJson(`${base}data/overview.json`);
  data = await fetchJson(`${base}data/data.json`);
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

// ---- P5-14: 클릭 경로 크롤(SC-18)이 「구조」 표를 실제로 판정한다 ----
// 표를 넣은 커밋이 크롤러를 함께 고치지 않아, 표가 쓰는 기대 키를 크롤러가 모른 채 그 행을 무조건 실패로 적었다.
// 아래 첫 검사가 그 어긋남을 다시 만들지 못하게 막는다 — 표의 모든 기대 키에 실제 확인이 있어야 한다.
test('SC-18 계약: 클릭 대상 표가 쓰는 기대 키는 모두 크롤러가 확인한다', () => {
  const rows = [...targets.overview, ...Object.values(targets.screens || {}).flatMap((s) => s.targets || [])];
  const used = new Set(rows.flatMap((t) => Object.keys(t.expect || {})));
  const missing = [...used].filter((k) => !KNOWN_EXPECT.has(k)).sort();
  assert.deepEqual(missing, [], `크롤러가 모르는 기대 키: ${missing.join(' · ')}`);
  // 반대쪽도 본다: 아무 행도 쓰지 않는 확인은 죽은 코드다
  const unused = [...KNOWN_EXPECT].filter((k) => !used.has(k)).sort();
  assert.deepEqual(unused, [], `표가 쓰지 않는 확인: ${unused.join(' · ')}`);
});

test('SC-18 when 판정: 구조 조건은 data.json 의 구조 절에서 읽는다', () => {
  const facts = whenFacts(served, data);
  assert.equal(whenHolds('architecture >= 1', facts), true);
  assert.equal(whenHolds('communities >= 1', facts), true);
  assert.equal(whenHolds('flows >= 1', facts), true);
  assert.equal(facts.communities, data.architecture.communities.length);
  assert.equal(facts.flows, data.architecture.flows.length);
  // 개요에서 읽던 조건은 그대로다
  assert.equal(facts.journeys.length, served.journeys.length);
  assert.equal(whenHolds('journeys >= 13', facts), served.journeys.length >= 13);
  // 구조 절이 없는 프로젝트(2.0.2 자료)는 세 조건이 모두 거짓이고 구조 표를 건너뛴다
  const none = whenFacts(served, { ...data, architecture: undefined });
  assert.deepEqual([whenHolds('architecture >= 1', none), whenHolds('communities >= 1', none), whenHolds('flows >= 1', none)], [false, false, false]);
  // data.json 을 못 받은 실행에서도 터지지 않는다
  assert.equal(whenHolds('architecture >= 1', whenFacts(served, null)), false);
});

test('SC-18 구조 표: 열여섯 행이 모두 판정되고 실패가 없다', async () => {
  // 이 파일의 기본 page 는 data.json 응답을 늦추는 route 가 걸려 있다. 구조 표는 늦춤 없는 새 창에서 잰다
  const { ctx: bctx2, page: p2, log: log2 } = await openCrawlContext(browser, { generatedAt: served.generatedAt });
  const spec = targets.screens.architecture;
  const facts = whenFacts(served, data);
  const open = () => openScreen(p2, base, spec.hash, 'architecture');
  await open();
  const rows = [];
  for (const t of spec.targets) rows.push(await checkOverviewTarget(p2, log2, ctx, t, { base, served: facts, overviewOnly: false, budgetSel: targets.clickBudget[0], open, screen: 'architecture' }));
  await bctx2.close();
  const fails = rows.filter((r) => r.pass === false).map((r) => `${r.name}: ${r.reason || JSON.stringify(r.checks)}${r.unimplemented ? ` 미구현 ${r.unimplemented}` : ''}`);
  assert.deepEqual(fails, [], fails.join('\n'));
  assert.equal(rows.filter((r) => r.unimplemented?.length).length, 0, '미구현 기대 키가 남아 있다');
  // 조건이 맞는 행은 건너뛰지 않는다: 묶음 상자·길 패널 기능 목록은 mini 에도 자료가 있다
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(byName['묶음 개요 묶음 상자'].pass, true, JSON.stringify(byName['묶음 개요 묶음 상자']));
  assert.equal(byName['길 패널 기능 목록'].pass, true, JSON.stringify(byName['길 패널 기능 목록']));
  assert.equal(byName['층 배치 노드 상자'].pass, true, JSON.stringify(byName['층 배치 노드 상자']));
  assert.ok(rows.filter((r) => r.pass === true).length >= 10, `통과 행 ${rows.filter((r) => r.pass === true).length}`);
});
