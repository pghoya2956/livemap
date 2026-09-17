#!/usr/bin/env node
// 클릭 경로 크롤러(SC-14): 개요의 클릭 대상 표 요소를 누르거나 확인하고, 라우트 패턴마다 자료의 모든 개체 주소를 방문해
// 화면 루트(data-screen)·대상 개체·콘솔 오류·CSP 위반을 본다. 선택자·기대·패턴·개체 출처는 --targets JSON(scripts/click-targets.json)에서 읽는다.
// 코드에 둔 것은 기대 키(expect.*)마다의 확인 방법과 라우트 패턴마다의 대상 개체 검사(ROUTE_CHECKS)다.
// 사용: node scripts/route-crawl.mjs --url http://127.0.0.1:<port>/map/ --targets scripts/click-targets.json [--only <screen>] [--overview-only] [--block-fonts] [--json <결과 파일>]
//   --only <screen>    그 화면(overview|journeys|roadmap|tasks|more)의 라우트 패턴과, 그 화면으로 가는 개요 요소만 본다.
//   --overview-only    이동 요소는 href 패턴만 보고 방문하지 않는다. 라우트 크롤을 건너뛰고, 하위 화면이 필요한 클릭 예산은 deferred로 남긴다.
// 종료 코드: 0 = 통과, 1 = 실패, 2 = 사용법 오류. 판정 스크립트(--routes)도 이 모듈의 runRoutes를 쓴다.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { get as httpGet } from 'node:http';

export const USAGE = 'node scripts/route-crawl.mjs --url <…/map/> --targets <click-targets.json> [--only <screen>] [--overview-only] [--block-fonts] [--json <결과 파일>]';
export const SCREENS = ['overview', 'journeys', 'roadmap', 'tasks', 'more'];
export const VIEWPORT = { width: 1440, height: 900 };
export const DEFERRED = '--overview-only: 하위 화면으로 이동한 뒤의 검사는 라우트 크롤에서 본다';
const LIMITS = { panels: 8 };
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const hostOf = (raw) => { if (!raw) return null; try { const u = new URL(/^https?:/.test(raw) ? raw : `https://${raw}`); return u.hostname.endsWith('.invalid') ? null : u.hostname; } catch { return null; } };

// ───────────────────────── 브라우저 안 함수 ─────────────────────────

/** addInitScript로 설치한다. window.__crawl 아래 함수. 인자 없는 함수여야 한다. */
export function CRAWL_LIB() {
  if (window.__crawl) return;
  window.__crawlCsp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__crawlCsp.push(`${e.violatedDirective} ${e.blockedURI}`));
  const J = {};
  J.describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal || '';
    const panel = el.closest?.('.panel')?.querySelector('h2')?.textContent;
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls.trim().split(/\s+/).join('.')}` : ''}${panel ? ` @${panel}` : ''}`;
  };
  /** DOM 변경이 ms 동안 없을 때까지(최대 max) 기다린다. */
  J.quiet = (ms = 200, max = 4000) => new Promise((res) => {
    let t = null, cap = null, done = false;
    const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, ms); });
    function fin() { if (done) return; done = true; obs.disconnect(); clearTimeout(t); clearTimeout(cap); res(true); }
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    t = setTimeout(fin, ms); cap = setTimeout(fin, max);
  });
  J.shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  J.inViewport = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  J.screenAttr = () => [...document.querySelectorAll('[data-screen]')].map((e) => e.getAttribute('data-screen'));
  J.hashLinks = () => [...new Set([...document.querySelectorAll('a[href^="#/"], [data-href^="#/"]')].map((e) => e.getAttribute('href') || e.getAttribute('data-href')))];
  J.label = (e) => (e.getAttribute('aria-label')?.split(',')[0] || e.querySelector('.tt, .jtitle, b')?.textContent || e.textContent || '').replace(/\s+/g, ' ').trim();
  J.isSelected = (e) => e.matches('.sel, .on, [aria-selected="true"], [aria-pressed="true"], [aria-current]');
  J.tabSelected = (tab) => {
    const c = [...document.querySelectorAll('.tabs button, .tabs a, [role="tablist"] [role="tab"]')];
    const id = (e) => e.dataset.t || (e.getAttribute('href') || '').split('/').pop() || e.id;
    const sel = c.filter((e) => e.classList.contains('on') || e.getAttribute('aria-selected') === 'true' || e.hasAttribute('aria-current'));
    return { tabs: c.length, selected: sel.map(id), ok: sel.length === 1 && id(sel[0]) === tab };
  };
  /** 라우트 패턴별 대상 개체 검사. kind와 arg는 노드 쪽 ROUTE_CHECKS가 정한다. */
  J.routeCheck = (kind, a) => {
    const q = (s) => [...document.querySelectorAll(s)].filter(J.shown).filter((e) => !e.closest('.nav'));
    const rows = () => q('tbody tr, .row, [role="row"], ul.log > li').length;
    const hl = () => q('tr.hl, tr.sel, .row.hl, .row.sel, tr[aria-selected="true"], .row[aria-selected="true"], [aria-current="true"]').length;
    switch (kind) {
      case 'none': return { ok: true };
      case 'overview': { const n = q('.panel').length; return { ok: n >= 1 && n <= a.max, panels: n }; }
      case 'unknown': { const n = q('.panel').length; const navSel = document.querySelectorAll('.nav a.on, .nav a[aria-current]').length; return { ok: n >= 1 && navSel === 0, panels: n, navSelected: navSel }; }
      case 'journeyList': {
        const ids = new Set(q('a[href^="#/journeys/"]').map((e) => e.getAttribute('href')).filter((h) => /^#\/journeys\/[^/]+$/.test(h)).map((h) => decodeURIComponent(h.split('/')[2])));
        const missing = a.ids.filter((i) => !ids.has(String(i)));
        return { ok: ids.size === a.ids.length && !missing.length, cards: ids.size, expected: a.ids.length, missing };
      }
      case 'journeyScenes': { const n = q('.scene').length; return { ok: n === a.steps, scenes: n, expected: a.steps }; }
      case 'stepDetail': { const on = q('.scene.on').length, d = q('.detail').length; return { ok: on === 1 && d > 0, sceneOn: on, detail: d }; }
      case 'roadmapList': { const missing = a.ids.filter((i) => !document.getElementById(`rm-${i}`)); return { ok: !missing.length, expected: a.ids.length, missing }; }
      case 'roadmapItem': {
        const el = document.getElementById(`rm-${a.id}`);
        const hi = !!el && el.matches('.on, .hl, .sel, [aria-current]');
        return { ok: !!el && J.shown(el) && J.inViewport(el) && hi, found: !!el, inViewport: !!el && J.inViewport(el), highlighted: hi };
      }
      case 'roadmapMilestone': {
        const el = document.getElementById(`rm-${a.id}`);
        const det = el && (el.tagName === 'DETAILS' ? el : el.closest('details') || el.querySelector('details'));
        return { ok: !!det && det.open && J.inViewport(det), found: !!el, details: !!det, open: !!det?.open };
      }
      case 'rows': { const n = rows(); return { ok: n >= a.min, rows: n, min: a.min }; }
      case 'detailHl': { const d = q('.detail').length, h = hl(); return { ok: d > 0 && h > 0, detail: d, highlighted: h }; }
      case 'tab': { const t = J.tabSelected(a.tab); const n = a.needRows ? rows() : null; return { ok: t.ok && (!a.needRows || n > 0), ...t, rows: n }; }
      default: return { ok: false, reason: `알 수 없는 검사 ${kind}` };
    }
  };
  /** 개요 대화형 요소 중 표 선택자에 맞지 않는 것. 이미 센 대화형 요소의 자손은 뺀다. */
  J.interactive = (selectors) => {
    const counted = new Set(), out = [];
    const isInter = (e) => e.matches('a[href], button, [role="button"], [tabindex]:not([tabindex="-1"]), summary') || getComputedStyle(e).cursor === 'pointer';
    for (const e of document.body.querySelectorAll('*')) {
      let inside = false;
      for (let p = e.parentElement; p; p = p.parentElement) if (counted.has(p)) { inside = true; break; }
      if (inside || !J.shown(e) || !isInter(e)) continue;
      counted.add(e);
      const listed = selectors.some((s) => { try { return e.matches(s); } catch { return false; } });
      if (!listed) out.push({ at: J.describe(e), text: (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), href: e.getAttribute('href'), cursor: getComputedStyle(e).cursor });
    }
    return { interactive: counted.size, unlisted: out };
  };
  J.runningUnder = (sel) => document.getAnimations().filter((x) => x.playState === 'running' && x.effect?.target?.closest?.(sel)).length;
  J.focusRing = () => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { at: J.describe(e), focusVisible: e.matches(':focus-visible'), outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth) || 0, ok: e.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; };
  window.__crawl = J;
}

// ───────────────────────── 브라우저·자료 ─────────────────────────

const getOnce = (url) => new Promise((ok, fail) => {
  // node:http를 쓴다. fetch(undici)와 Chromium은 4190(ManageSieve)을 금지 포트로 막는다(Fetch 표준 bad ports).
  httpGet(url, { headers: { 'cache-control': 'no-store' } }, (res) => {
    let body = ''; res.setEncoding('utf8'); res.on('data', (c) => { body += c; });
    res.on('end', () => (res.statusCode === 200 ? ok(body) : fail(new Error(`${url} ${res.statusCode}`))));
  }).on('error', fail);
});

export async function fetchJson(url, tries = 40) {
  // 방금 띄운 serve가 아직 듣지 않으면 연결 거부가 난다. 10초까지 다시 시도한다.
  for (let i = 0; ; i++) {
    try { return JSON.parse(await getOnce(url)); } catch (e) { if (i >= tries || !/ECONNREFUSED/.test(e.code || e.message)) throw e; await new Promise((ok) => setTimeout(ok, 250)); }
  }
}

/** Chromium 금지 포트(예: 4190)도 열리게 대상 포트를 명시 허용한다. */
export const launchBrowser = (url) => chromium.launch({ args: [`--explicitly-allowed-ports=${new URL(url).port || 80}`] });

/** 크롤용 컨텍스트와 수집기(콘솔 오류·pageerror). clock은 generatedAt + 10분(신선도·상대 시각이 매번 같게). */
export async function openCrawlContext(browser, { generatedAt, blockFonts = false, viewport = VIEWPORT }) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
  await ctx.addInitScript(CRAWL_LIB);
  const page = await ctx.newPage();
  const log = { console: [], pageerror: [] };
  page.on('console', (m) => { if (m.type() === 'error' && !(blockFonts && /\/fonts\//.test(m.location()?.url || ''))) log.console.push({ text: m.text().slice(0, 300), url: m.location()?.url || '' }); });
  page.on('pageerror', (e) => log.pageerror.push(String(e.message).slice(0, 300)));
  if (blockFonts) await page.route(/\/fonts\//, (route) => route.abort());
  if (generatedAt) await page.clock.setFixedTime(new Date(Date.parse(generatedAt) + 10 * 60000));
  return { ctx, page, log };
}

const settle = async (page, ms) => { await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))); await page.waitForTimeout(ms); };
const C = (page, fn, ...args) => page.evaluate(([f, a]) => window.__crawl[f](...a), [fn, args]);

// ───────────────────────── 라우트 ─────────────────────────

const UNKNOWN_ROUTE = '#/no-such-route';
export const patternRegex = (p) => new RegExp(`^${p.split(/<[^>]+>/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([^/]+)')}$`);
const patternParams = (p) => [...p.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
const getPath = (o, p) => p.split('.').filter(Boolean).reduce((x, k) => x?.[k], o);

/** "semantic.journeys[].steps[].id" 같은 출처를 개체 튜플로 편다. 부모 배열 원소는 같은 튜플에 묶인다. */
export function enumerateParams(sources, params) {
  const ps = Object.entries(params).map(([name, src]) => {
    const enc = /encodeURIComponent/.test(src);
    const segs = src.replace(/\(.*\)/, '').trim().split('[]');
    const leaf = segs.pop().replace(/^\./, '');
    return { name, arrays: segs.map((s) => s.replace(/^\./, '')), leaf, enc };
  });
  const spine = ps.reduce((a, b) => (b.arrays.length > a.arrays.length ? b : a));
  const hit = sources.find((s) => Array.isArray(getPath(s.data, spine.arrays[0])));
  if (!hit) return { tuples: [], source: null };
  const tuples = [];
  const rec = (obj, d, bind) => {
    for (const el of getPath(obj, spine.arrays[d]) || []) {
      const b = { ...bind };
      for (const p of ps) if (p.arrays.length === d + 1) { const v = String(getPath(el, p.leaf)); b[p.name] = p.enc ? encodeURIComponent(v) : v; b[`__el_${p.name}`] = el; }
      if (d + 1 < spine.arrays.length) rec(el, d + 1, b); else tuples.push(b);
    }
  };
  rec(hit.data, 0, {});
  return { tuples, source: hit.name };
}

const fillPattern = (p, t) => p.replace(/<([^>]+)>/g, (_, n) => t[n]);

/** 라우트 패턴 → 브라우저 안 J.routeCheck(kind, arg). 표에 없는 패턴은 화면 루트·콘솔만 본다. */
export const ROUTE_CHECKS = {
  '#/overview': () => ({ kind: 'overview', arg: { max: LIMITS.panels } }),
  [UNKNOWN_ROUTE]: () => ({ kind: 'unknown', arg: {} }),
  '#/journeys': (c) => ({ kind: 'journeyList', arg: { ids: c.ids('#/journeys/<journey>', 'journey') } }),
  '#/journeys/<journey>': (c, t) => ({ kind: 'journeyScenes', arg: { steps: (t.__el_journey?.steps || []).length } }),
  '#/journeys/<journey>/<step>': () => ({ kind: 'stepDetail', arg: {} }),
  '#/roadmap': (c) => ({ kind: 'roadmapList', arg: { ids: c.ids('#/roadmap/<item>', 'item') } }),
  '#/roadmap/<item>': (c, t) => ({ kind: 'roadmapItem', arg: { id: decodeURIComponent(t.item) } }),
  '#/roadmap/<milestone>': (c, t) => ({ kind: 'roadmapMilestone', arg: { id: decodeURIComponent(t.milestone) } }),
  '#/tasks': (c) => ({ kind: 'rows', arg: { min: c.ids('#/tasks/<task>', 'task').length ? 1 : 0 } }),
  '#/tasks/<task>': () => ({ kind: 'detailHl', arg: {} }),
  '#/changes': () => ({ kind: 'tab', arg: { tab: 'changes', needRows: true } }),
  '#/more': () => ({ kind: 'tab', arg: { tab: 'decisions' } }),
  '#/more/changes': () => ({ kind: 'tab', arg: { tab: 'changes', needRows: true } }),
  '#/more/screens/<screen>': () => ({ kind: 'detailHl', arg: {} }),
};
const checkFor = (pattern, c, t) => (ROUTE_CHECKS[pattern] ? ROUTE_CHECKS[pattern](c, t)
  : /^#\/more\/[a-z]+$/.test(pattern) ? { kind: 'tab', arg: { tab: pattern.split('/').pop() } } : { kind: 'none', arg: {} });

/** 크롤 문맥: 표 라우트, 개체 색인, 주소 → 패턴 판정. */
export function buildRouteIndex(targets, sources) {
  const routes = targets.routes.map((r) => ({ ...r, re: patternRegex(r.pattern), names: patternParams(r.pattern) }));
  const entities = new Map(); // pattern → { tuples, source, byHash }
  for (const r of routes) {
    if (!r.params) { entities.set(r.pattern, { tuples: [{}], source: null, byHash: new Map([[r.pattern, {}]]) }); continue; }
    const e = enumerateParams(sources, r.params);
    e.byHash = new Map(e.tuples.map((t) => [fillPattern(r.pattern, t), t]));
    entities.set(r.pattern, e);
  }
  const ctx = {
    routes, entities,
    ids: (pattern, name) => (entities.get(pattern)?.tuples || []).map((t) => decodeURIComponent(t[name])),
    /** 주소가 맞는 표 라우트. 같은 모양(#/roadmap/<item>·<milestone>)은 개체 색인에 있는 쪽. 알 수 없는 경로 패턴은 제외. */
    match: (hash) => {
      const h = hash === '' || hash === '#' ? '#/overview' : hash;
      const cands = routes.filter((r) => r.pattern !== UNKNOWN_ROUTE && r.re.test(h));
      if (!cands.length) return h === UNKNOWN_ROUTE ? { route: routes.find((r) => r.pattern === UNKNOWN_ROUTE), tuple: {} } : null;
      const known = cands.find((r) => entities.get(r.pattern)?.byHash.has(h));
      const route = known || cands[0];
      let tuple = entities.get(route.pattern)?.byHash.get(h);
      if (!tuple) { const m = h.match(route.re); tuple = Object.fromEntries(route.names.map((n, i) => [n, m[i + 1]])); }
      return { route, tuple, known: !!known };
    },
  };
  return ctx;
}

const errCount = (log) => log.console.length + log.pageerror.length;

/** 같은 페이지에서 해시만 바꿔 방문한다. */
export async function visitHash(page, log, ctx, hash) {
  const e0 = errCount(log), c0 = await page.evaluate(() => (window.__crawlCsp || []).length);
  await page.evaluate((h) => { location.hash = h; }, hash);
  await C(page, 'quiet', 200, 4000);
  const m = ctx.match(hash);
  const screens = await C(page, 'screenAttr');
  const chk = m ? checkFor(m.route.pattern, ctx, m.tuple) : null;
  const content = chk ? await C(page, 'routeCheck', chk.kind, chk.arg) : null;
  const errors = [...log.console, ...log.pageerror.map((t) => ({ text: t }))].slice(e0).map((x) => x.text);
  const csp = (await page.evaluate(() => window.__crawlCsp || [])).slice(c0);
  const screenAttr = screens.length > 0;
  const screenOk = screenAttr ? screens.includes(m?.route.screen) : null;
  const finalHash = await page.evaluate(() => location.hash);
  const unknownEntity = !!m && !!m.route.params && !m.known; // 모양은 맞지만 자료에 없는 개체 id
  return { hash, pattern: m?.route.pattern ?? null, unknownEntity, pass: !!m && !unknownEntity && !!content?.ok && errors.length === 0 && csp.length === 0 && screenOk !== false,
    screenAttr, screen: screens, screenOk, check: chk?.kind, content, errors, csp, finalHash };
}

/** 라우트 패턴의 모든 개체를 방문하고, 방문한 화면의 #/ 링크를 따라간다. scope(screen)이 거짓인 화면의 패턴과 링크는 건너뛴다. */
export async function crawlRoutes(page, log, ctx, { maxFollow = 400, scope = () => true } = {}) {
  const t0 = Date.now();
  const visited = new Map(), offPattern = new Set(), queue = [], discovered = new Set();
  const byPattern = [];
  const run = async (hash) => {
    const v = await visitHash(page, log, ctx, hash);
    visited.set(hash, v);
    for (const h of await C(page, 'hashLinks')) {
      discovered.add(h);
      if (visited.has(h) || queue.includes(h)) continue;
      const m = ctx.match(h);
      if (!m) offPattern.add(h); else if (scope(m.route.screen)) queue.push(h);
    }
    return v;
  };
  for (const r of ctx.routes.filter((x) => scope(x.screen))) {
    const e = ctx.entities.get(r.pattern);
    const hashes = r.params ? e.tuples.map((t) => fillPattern(r.pattern, t)) : [r.pattern];
    let passed = 0, sample = null;
    for (const h of hashes) { const v = visited.get(h) || await run(h); if (v.pass) passed++; sample ||= { hash: v.hash, check: v.check, content: v.content, screen: v.screen }; }
    byPattern.push({ pattern: r.pattern, screen: r.screen, entities: hashes.length, source: e.source, passed, sample });
  }
  let followed = 0;
  while (queue.length && followed < maxFollow) {
    const h = queue.shift(); if (visited.has(h)) continue;
    await run(h); followed++;
  }
  const visits = [...visited.values()];
  return {
    visits: visits.length, passed: visits.filter((v) => v.pass).length, followed, discoveredLinks: discovered.size, followCapped: queue.length > 0,
    failures: visits.filter((v) => !v.pass).slice(0, 60),
    screenAttrMissing: visits.filter((v) => !v.screenAttr).length,
    offPattern: [...offPattern], byPattern, ms: Date.now() - t0,
  };
}

async function reloadOverview(page, base) {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.panel', { timeout: 15000 });
  await settle(page, 250);
}
const shownIdx = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e, i) => (window.__crawl.shown(e) ? i : -1)).filter((i) => i >= 0));
async function clickLoc(loc, how = 'click') {
  try { await loc[how]({ timeout: 3000 }); return how; } catch { await loc.dispatchEvent(how === 'dblclick' ? 'dblclick' : 'click'); return `dispatch ${how}`; }
}
const quiet = (page) => C(page, 'quiet', 200, 3000);

/** 선택 동기: 각 선택자 목록에서 선택 표시가 붙은 요소의 글자에 label이 들어 있는지. */
// 목록이 잘려(목록 맞춤·미완성 기능만) 그 이름이 없는 목록은 판정하지 않는다(ok: null).
async function syncState(page, sels, label) {
  return page.evaluate(([ss, lb]) => ss.map((s) => {
    const txt = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ');
    const all = [...document.querySelectorAll(s)];
    const sel = all.filter((e) => window.__crawl.isSelected(e));
    if (!all.some((e) => txt(e).includes(lb))) return { selector: s, ok: null, reason: '목록에 그 이름 없음', selected: sel.map((e) => window.__crawl.label(e)).slice(0, 3) };
    return { selector: s, ok: sel.some((e) => txt(e).includes(lb)), selected: sel.map((e) => window.__crawl.label(e)).slice(0, 3) };
  }), [sels, label]);
}
const syncOk = (st) => st.some((x) => x.ok === true) && st.every((x) => x.ok !== false);

/** 선택 동기 확인 대상: 동기 목록 하나 이상에 같은 이름이 있는 요소. 많은 목록에 있는 것부터. */
async function syncCandidates(page, sel, sels) {
  return page.evaluate(([s, ss]) => {
    const J = window.__crawl;
    const lists = ss.map((x) => [...document.querySelectorAll(x)].map((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ')));
    return [...document.querySelectorAll(s)].map((e, i) => ({ i, label: J.label(e), shown: J.shown(e), selected: J.isSelected(e) }))
      .map((x) => ({ ...x, lists: lists.filter((l) => l.some((t) => t.includes(x.label))).length }))
      .filter((x) => x.shown && x.label && x.lists > 0).sort((a, b) => b.lists - a.lists || b.i - a.i);
  }, [sel, sels]);
}

const whenHolds = (when, served) => {
  const m = String(when || '').match(/^(\w+)\s*(>=|<=|>|<|==)\s*(\d+)$/); if (!m) return true;
  const raw = served[m[1]]; const v = Array.isArray(raw) ? raw.length : Number(raw ?? served.counts?.[m[1]] ?? 0), n = Number(m[3]);
  return { '>=': v >= n, '<=': v <= n, '>': v > n, '<': v < n, '==': v === n }[m[2]];
};

const KNOWN_EXPECT = new Set(['hrefs', 'ariaCurrent', 'hrefIn', 'pattern', 'patternIn', 'visible', 'hostFrom', 'rel', 'ariaPressedToggles', 'stopsAnimation', 'ariaPressed',
  'filtersRowsByKind', 'syncsSelection', 'keys', 'hidesLayer', 'dblclickClearsFocus', 'escapeKey', 'switchesCapture', 'stopsRotation', 'switchesDetail', 'cursor', 'title']);

/** 표 요소 하나를 판정한다. 매번 개요를 새로 연다. scope가 있으면 이동 요소는 그 화면으로 가는 주소만, 제자리·외부·비대화형 요소는 개요 범위에서만 본다. */
export async function checkOverviewTarget(page, log, ctx, t, { base, served, overviewOnly, budgetSel, scope = () => true }) {
  const x = t.expect || {};
  const out = { name: t.name, selector: t.selector, kind: t.kind, source: t.source, optional: !!t.optional };
  if (t.kind !== 'route' && !scope('overview')) return { ...out, pass: null, skipped: '--only 범위 밖' };
  await reloadOverview(page, base);
  const unknownKeys = Object.keys(x).filter((k) => !KNOWN_EXPECT.has(k));
  if (unknownKeys.length) out.unimplemented = unknownKeys;
  let idx;
  try { idx = await shownIdx(page, t.selector); } catch (e) { return { ...out, pass: false, reason: `선택자 오류 ${e.message}` }; }
  out.count = idx.length;
  if (t.when && !whenHolds(t.when, served)) return { ...out, pass: null, skipped: `조건 불충족(${t.when})` };
  if (!idx.length) return t.optional ? { ...out, pass: null, skipped: '요소 없음(optional)' } : { ...out, pass: false, reason: '요소 없음' };
  const loc = (i) => page.locator(t.selector).nth(i);
  const checks = {};
  const attr = (i, a) => loc(i).getAttribute(a);

  if (t.kind === 'route') {
    const els = await Promise.all(idx.map(async (i) => ({ i, tag: await loc(i).evaluate((e) => e.tagName.toLowerCase()), href: await attr(i, 'href'), cur: await attr(i, 'aria-current') })));
    const hrefs = [...new Set(els.map((e) => e.href))];
    out.hrefs = hrefs.slice(0, 20);
    checks.anchorWithHref = els.every((e) => e.tag === 'a' && e.href);
    if (x.hrefs) checks.hrefs = hrefs.length === x.hrefs.length && x.hrefs.every((h) => hrefs.includes(h));
    if (x.ariaCurrent) checks.ariaCurrent = els.every((e) => (e.href === x.ariaCurrent ? e.cur === 'page' : !e.cur));
    if (x.hrefIn) checks.hrefIn = hrefs.every((h) => x.hrefIn.includes(h));
    const pats = x.pattern ? [x.pattern] : x.patternIn || null;
    if (pats) checks.pattern = hrefs.every((h) => h && pats.some((p) => patternRegex(p).test(h)));
    const inScope = hrefs.filter((h) => h && scope(ctx.match(h)?.route.screen));
    if (!inScope.length) return { ...out, pass: null, skipped: '--only 범위 밖' };
    if (!overviewOnly) {
      const navs = [];
      for (const href of inScope.slice(0, 6)) {
        await reloadOverview(page, base);
        const i = (await page.locator(t.selector).evaluateAll((es, h) => es.map((e, k) => (e.getAttribute('href') === h && window.__crawl.shown(e) ? k : -1)).filter((k) => k >= 0), href))[0];
        if (i == null) { navs.push({ href, pass: false, reason: '다시 연 개요에 요소 없음' }); continue; }
        const e0 = errCount(log);
        const how = await clickLoc(loc(i)); await quiet(page);
        const hash = await page.evaluate(() => location.hash);
        const m = ctx.match(hash);
        const expectPat = pats ? pats.find((p) => patternRegex(p).test(href)) : ctx.match(href)?.route.pattern;
        const screens = await C(page, 'screenAttr');
        const chk = m ? checkFor(m.route.pattern, ctx, m.tuple) : null;
        let content = chk ? await C(page, 'routeCheck', chk.kind, chk.arg) : null;
        if (x.visible) content = { ...(content || {}), visibleSelector: x.visible, visible: await page.locator(x.visible).first().isVisible().catch(() => false) };
        const contentOk = x.visible ? content.visible : !!content?.ok;
        const hashOk = hash === href || (href === '#/overview' && (hash === '' || hash === '#/overview'));
        const screenAttr = screens.length > 0, screenOk = screenAttr ? screens.includes(m?.route.screen) : null;
        navs.push({ href, how, hash, pattern: m?.route.pattern ?? null, expectPattern: expectPat, screenAttr, screen: screens, screenOk, content, errors: errCount(log) - e0,
          pass: hashOk && !!m && (!expectPat || m.route.pattern === expectPat) && contentOk && screenOk !== false && errCount(log) === e0 });
      }
      out.navigations = navs;
      checks.navigations = navs.every((n) => n.pass);
      out.screenAttrMissing = navs.filter((n) => n.screenAttr === false).length;
    }
  } else if (t.kind === 'external') {
    const i = idx[0];
    const href = await attr(i, 'href'), target = await attr(i, 'target'), rel = await attr(i, 'rel');
    out.attrs = { href, target, rel };
    if (x.hostFrom) { let h = null; try { h = new URL(href).hostname; } catch { /* 잘못된 href */ } checks.host = !!h && h === hostOf(getPath(served, x.hostFrom)); }
    checks.target = target === '_blank';
    if (x.rel) checks.rel = x.rel.split(/\s+/).every((tok) => (rel || '').split(/\s+/).includes(tok));
  } else if (t.kind === 'none') {
    const r = await page.locator(t.selector).evaluateAll((es) => es.slice(0, 80).map((e) => {
      const own = getComputedStyle(e).cursor, parent = e.parentElement ? getComputedStyle(e.parentElement).cursor : 'auto';
      const title = !!e.querySelector('title') || [...(e.parentElement?.children || [])].some((c) => c.tagName.toLowerCase() === 'title');
      return { cursorOk: own !== 'pointer' || parent === 'pointer', title };
    }));
    if (x.cursor) checks.cursor = r.every((e) => e.cursorOk);
    if (x.title) checks.title = r.every((e) => e.title);
  } else if (t.kind === 'inplace') {
    const i0 = idx[0];
    if (x.ariaPressedToggles) {
      const p0 = await attr(i0, 'aria-pressed');
      // 클릭 뒤 포인터가 요소 위에 남으면 :hover 정지 규칙이 섞인다. 재기 전에 포인터를 치운다.
      const anim = async () => { if (!x.stopsAnimation) return null; await page.mouse.move(1, (page.viewportSize()?.height || 900) - 1); await page.waitForTimeout(100); return C(page, 'runningUnder', x.stopsAnimation); };
      const a0 = await anim();
      await clickLoc(loc(i0)); await quiet(page); const p1 = await attr(i0, 'aria-pressed'); const a1 = await anim();
      await clickLoc(loc(i0)); await quiet(page); const p2 = await attr(i0, 'aria-pressed'); const a2 = await anim();
      out.toggle = { pressed: [p0, p1, p2], running: x.stopsAnimation ? [a0, a1, a2] : undefined };
      checks.ariaPressedToggles = p0 != null && p1 !== p0 && p2 === p0;
      if (x.stopsAnimation) checks.stopsAnimation = a0 > 0 && a1 === 0 && a2 > 0;
      if (x.hidesLayer) {
        const shapes = () => loc(i0).evaluate((b) => { let c = b.parentElement; while (c && !c.querySelector('svg:not(.stepmark)')) c = c.parentElement; return c ? [...c.querySelector('svg:not(.stepmark)').querySelectorAll('circle, path, line, rect, text')].filter((s) => s.getClientRects().length && getComputedStyle(s).display !== 'none' && getComputedStyle(s).visibility !== 'hidden').length : -1; });
        const s0 = await shapes(); await clickLoc(loc(i0)); await quiet(page); const s1 = await shapes(); await clickLoc(loc(i0)); await quiet(page); const s2 = await shapes();
        out.layer = { shapes: [s0, s1, s2] };
        checks.hidesLayer = s0 > 0 && s1 < s0 && s2 === s0;
      }
    }
    if (x.ariaPressed) {
      const states = await page.locator(t.selector).evaluateAll((es) => es.map((e) => e.getAttribute('aria-pressed')));
      checks.ariaPressed = states.every((s) => s === 'true' || s === 'false');
      if (x.filtersRowsByKind && idx.length > 1) {
        const k = idx[1];
        await clickLoc(loc(k)); await quiet(page);
        const r = await loc(k).evaluate((chip) => {
          const label = [...chip.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
          const panel = chip.closest('.panel') || document;
          const rows = [...panel.querySelectorAll('.row')].filter((e) => window.__crawl.shown(e));
          return { label, pressed: chip.getAttribute('aria-pressed'), rows: rows.length, mismatched: rows.filter((row) => (row.querySelector('.tag')?.textContent || row.textContent).trim().indexOf(label) !== 0).length };
        });
        out.filter = r;
        checks.filtersRowsByKind = r.pressed === 'true' && r.rows > 0 && r.mismatched === 0;
      } else if (x.filtersRowsByKind) checks.filtersRowsByKind = false;
    }
    if (x.syncsSelection) {
      // 선택되지 않은 요소를 먼저 누른다. 기능이 하나뿐이라 모두 이미 선택돼 있으면 그 요소를 다시 눌러 동기가 유지되는지 본다.
      const pickable = (cs) => (cs.some((c) => !c.selected) ? cs.filter((c) => !c.selected) : cs);
      const cands = pickable(await syncCandidates(page, t.selector, x.syncsSelection));
      out.syncCandidates = cands.length;
      if (!cands.length) { checks.syncsSelection = false; out.reason = '동기 목록에 이름이 있는 선택 가능 요소 없음'; }
      else {
        const c = cands[0];
        await clickLoc(loc(c.i)); await quiet(page);
        const st = await syncState(page, x.syncsSelection, c.label);
        out.sync = { label: c.label, lists: st };
        checks.syncsSelection = syncOk(st);
        for (const key of x.keys || []) {
          await reloadOverview(page, base);
          const kc = pickable(await syncCandidates(page, t.selector, x.syncsSelection));
          const z = kc[0];
          if (!z) { checks[`key ${JSON.stringify(key)}`] = false; continue; }
          await loc(z.i).focus(); await page.keyboard.press(key === ' ' ? 'Space' : key); await quiet(page);
          const ks = await syncState(page, x.syncsSelection, z.label);
          checks[`key ${JSON.stringify(key)}`] = syncOk(ks);
        }
      }
    }
    if (x.dblclickClearsFocus || x.escapeKey) {
      const state = () => loc(i0).evaluate((w) => `${w.className}|${w.querySelector('svg')?.getAttribute('class') || ''}`);
      const selSel = budgetSel;
      const s0 = await state();
      const pick = async () => { const j = (await shownIdx(page, selSel))[0]; if (j == null) return false; await clickLoc(page.locator(selSel).nth(j)); await quiet(page); return true; };
      const r = { initial: s0 };
      if (x.dblclickClearsFocus) {
        if (!(await pick())) checks.dblclickClearsFocus = false;
        else { r.afterSelect = await state(); await loc(i0).dblclick({ position: { x: 4, y: 4 }, timeout: 3000 }).catch(() => loc(i0).dispatchEvent('dblclick')); await quiet(page); r.afterDblclick = await state(); checks.dblclickClearsFocus = r.afterSelect !== s0 && r.afterDblclick === s0; }
      }
      if (x.escapeKey) {
        await reloadOverview(page, base);
        if (!(await pick())) checks.escapeKey = false;
        else { r.afterSelect2 = await state(); await page.keyboard.press('Escape'); await quiet(page); r.afterEscape = await state(); checks.escapeKey = r.afterSelect2 !== s0 && r.afterEscape === s0; }
      }
      out.focusState = r;
    }
    if (x.switchesCapture || x.stopsRotation) {
      const state = (i) => loc(i).evaluate((b) => { const box = b.closest('.live') || b.closest('.panel')?.querySelector('.live'); return `${box?.querySelector('.cnt')?.textContent || ''}|${box?.querySelector(':scope > img, img')?.getAttribute('src') || ''}`; });
      const k = idx.length > 1 ? idx[1] : idx[0];
      const s0 = await state(k); await clickLoc(loc(k)); await quiet(page); const s1 = await state(k);
      if (x.switchesCapture) checks.switchesCapture = idx.length > 1 ? s1 !== s0 : true;
      if (x.stopsRotation) { await page.waitForTimeout(6800); const s2 = await state(k); checks.stopsRotation = s2 === s1; out.capture = { states: [s0, s1, s2] }; }
    }
    if (x.switchesDetail) {
      const k = idx[idx.length - 1];
      const label = await loc(k).evaluate((e) => window.__crawl.label(e));
      await clickLoc(loc(k)); await quiet(page);
      const d = await loc(k).evaluate((e) => (e.closest('.panel')?.querySelector('.detail')?.textContent || '').replace(/\s+/g, ' '));
      out.detail = { label, detailHasLabel: d.includes(label) };
      checks.switchesDetail = !!label && d.includes(label);
    }
  } else checks.kind = false;
  out.checks = checks;
  out.pass = Object.values(checks).every(Boolean) && !unknownKeys.length;
  return out;
}

/** clickBudget 선택자 순서대로 누르고 마지막 선택자가 보이는지. 다음 선택자가 이미 보이면 그 단계를 건너뛴다. */
export async function measureClickBudget(page, base, seq) {
  await reloadOverview(page, base);
  const steps = []; let clicks = 0;
  const vis = async (sel, timeout) => { try { await page.locator(sel).first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; } };
  try {
    for (let i = 0; i < seq.length - 1; i++) {
      if (i > 0 && await vis(seq[i + 1], 300)) { steps.push(`skip ${seq[i]}`); continue; }
      if (!(await vis(seq[i], i === 0 ? 1000 : 2500))) return { pass: false, clicks, steps, reason: `${seq[i]} 보이지 않음`, hash: await page.evaluate(() => location.hash) };
      steps.push(`${await clickLoc(page.locator(seq[i]).first())} ${seq[i]}`); clicks++; await quiet(page);
    }
    const ok = await vis(seq[seq.length - 1], 3000);
    return { pass: ok && clicks <= 3, clicks, steps, hash: await page.evaluate(() => location.hash), reason: ok ? undefined : `${seq[seq.length - 1]} 보이지 않음` };
  } catch (e) { return { pass: false, clicks, steps, reason: String(e.message).slice(0, 200) }; }
}

async function tabTo(page, sel, max = 250) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => { try { return !!document.activeElement?.matches(s); } catch { return false; } }, sel)) return i + 1;
  }
  return null;
}

/** 키보드 경로: 선택자는 clickBudget[0]·[1], stopsAnimation·stopsRotation을 가진 표 요소에서 가져온다. */
export async function measureKeyboard(page, base, targets) {
  const find = (k) => targets.overview.find((t) => t.expect?.[k]);
  const byPattern = (sel) => targets.overview.find((t) => t.selector === sel);
  const steps = [], rings = [];
  const [selPick, selOpen] = targets.clickBudget;
  // 1. Tab → 선택 요소, Enter → 선택 동기
  await reloadOverview(page, base);
  {
    const tabs = await tabTo(page, selPick);
    const r = { step: `Tab → ${selPick}, Enter`, tabs };
    if (tabs == null) Object.assign(r, { pass: false, reason: 'Tab으로 닿지 않음' });
    else {
      rings.push(await C(page, 'focusRing'));
      const label = await page.evaluate(() => window.__crawl.label(document.activeElement));
      await page.keyboard.press('Enter'); await quiet(page);
      const sels = byPattern(selPick)?.expect?.syncsSelection || [];
      const st = sels.length ? await syncState(page, sels, label) : [];
      Object.assign(r, { label, sync: st, pass: sels.length > 0 && syncOk(st) });
      if (!sels.length) r.reason = '표에 syncsSelection 없음';
    }
    steps.push(r);
  }
  // 2. Tab → 기능 화면 링크, Enter → 패턴
  {
    const tabs = await tabTo(page, selOpen);
    const pat = byPattern(selOpen)?.expect?.pattern;
    const r = { step: `Tab → ${selOpen}, Enter`, tabs, expectPattern: pat };
    if (tabs == null) Object.assign(r, { pass: false, reason: 'Tab으로 닿지 않음' });
    else {
      rings.push(await C(page, 'focusRing'));
      await page.keyboard.press('Enter'); await quiet(page);
      r.hash = await page.evaluate(() => location.hash);
      r.pass = !!pat && patternRegex(pat).test(r.hash);
    }
    steps.push(r);
  }
  // 3. 전광판 정지 Space
  const pause = find('stopsAnimation');
  await reloadOverview(page, base);
  {
    const r = { step: `Tab → ${pause?.selector}, Space` };
    const tabs = pause ? await tabTo(page, pause.selector) : null;
    r.tabs = tabs;
    if (tabs == null) Object.assign(r, { pass: false, reason: pause ? 'Tab으로 닿지 않음' : '표에 stopsAnimation 요소 없음' });
    else {
      rings.push(await C(page, 'focusRing'));
      const p0 = await page.evaluate(() => document.activeElement.getAttribute('aria-pressed'));
      await page.keyboard.press('Space'); await quiet(page);
      const p1 = await page.evaluate(() => document.activeElement.getAttribute('aria-pressed'));
      Object.assign(r, { pressed: [p0, p1], pass: p0 != null && p0 !== p1 });
    }
    steps.push(r);
  }
  // 4. 캡처 썸네일 Space → 회전 정지(요소가 없으면 건너뜀)
  const thumb = find('stopsRotation');
  await reloadOverview(page, base);
  {
    const r = { step: `Tab → ${thumb?.selector}, Space` };
    const present = thumb ? (await shownIdx(page, thumb.selector)).length > 0 : false;
    if (!present) Object.assign(r, { pass: null, skipped: '썸네일 없음' });
    else {
      r.tabs = await tabTo(page, thumb.selector);
      if (r.tabs == null) Object.assign(r, { pass: false, reason: 'Tab으로 닿지 않음' });
      else {
        rings.push(await C(page, 'focusRing'));
        const state = () => page.evaluate(() => { const b = document.activeElement; const box = b.closest('.live') || b.closest('.panel')?.querySelector('.live'); return `${box?.querySelector('.cnt')?.textContent || ''}|${box?.querySelector('img')?.getAttribute('src') || ''}`; });
        await page.keyboard.press('Space'); await quiet(page);
        const s1 = await state(); await page.waitForTimeout(6800); const s2 = await state();
        Object.assign(r, { states: [s1, s2], pass: s1 === s2 });
      }
    }
    steps.push(r);
  }
  // 5. 초점 고리
  const ringsFound = rings.filter(Boolean);
  steps.push({ step: ':focus-visible 고리 2px', rings: ringsFound, pass: ringsFound.length > 0 && ringsFound.every((x) => x.ok) });
  return { pass: steps.every((s) => s.pass !== false), steps };
}

/** 클릭 대상 표 요소가 이동할 화면. 이동 요소가 아니면 overview. */
const targetScreen = (ctx, t) => { const p = t?.expect?.pattern; return p ? ctx.routes.find((r) => r.pattern === p)?.screen ?? 'overview' : 'overview'; };

/** SC-14 전체. 한 컨텍스트·한 페이지를 쓴다. only(화면 이름)가 있으면 그 화면 범위만 본다. */
export async function runRoutes(browser, { base, served, targetsPath, overviewOnly, blockFonts, only = null }) {
  if (only && !SCREENS.includes(only)) throw new Error(`--only는 ${SCREENS.join('|')} 중 하나`);
  const scope = (screen) => !only || screen === only;
  const t0 = Date.now();
  const targets = JSON.parse(readFileSync(targetsPath, 'utf8'));
  let data = null;
  try { data = await fetchJson(`${base}data/data.json`); } catch (e) { data = null; }
  const ctx = buildRouteIndex(targets, [{ name: 'data.json', data: data || {} }, { name: 'overview.json', data: served }]);
  const { ctx: bctx, page, log } = await openCrawlContext(browser, { generatedAt: served.generatedAt, blockFonts });
  const timing = {};
  try {
    await reloadOverview(page, base);
    const selectors = targets.overview.map((t) => t.selector);
    const inter = scope('overview') ? await C(page, 'interactive', selectors) : { interactive: null, unlisted: [], skipped: '--only 범위 밖' };
    let t = Date.now();
    const overviewTargets = [];
    for (const target of targets.overview) overviewTargets.push(await checkOverviewTarget(page, log, ctx, target, { base, served, overviewOnly, budgetSel: targets.clickBudget[0], scope }));
    timing.overviewTargets = Date.now() - t; t = Date.now();
    const budgetScreen = targetScreen(ctx, targets.overview.find((o) => o.selector === targets.clickBudget[1]));
    const clickBudget = scope(budgetScreen) ? await measureClickBudget(page, base, targets.clickBudget) : { pass: null, skipped: '--only 범위 밖' };
    const keyboard = scope('overview') ? await measureKeyboard(page, base, targets) : { pass: null, skipped: '--only 범위 밖' };
    timing.clickBudgetKeyboard = Date.now() - t; t = Date.now();
    let routes, patternsMissing;
    if (overviewOnly) { routes = { skipped: '--overview-only' }; patternsMissing = { skipped: '--overview-only' }; }
    else {
      await reloadOverview(page, base);
      routes = await crawlRoutes(page, log, ctx, { scope });
      patternsMissing = routes.byPattern.filter((p) => p.entities === 0).map((p) => ({ pattern: p.pattern, reason: '자료에 개체 없음(방문 못 함)' }));
      timing.routes = Date.now() - t;
    }
    const navMissing = sum(overviewTargets.map((o) => o.screenAttrMissing || 0));
    const summary = {
      targets: { pass: overviewTargets.filter((o) => o.pass === true).length, fail: overviewTargets.filter((o) => o.pass === false).length, skipped: overviewTargets.filter((o) => o.pass === null).length },
      interactive: inter.interactive, unlisted: inter.unlisted.length,
      visits: routes.visits ?? null, visitsPassed: routes.passed ?? null, visitFailures: routes.failures?.length ?? null, offPattern: routes.offPattern?.length ?? null,
      screenAttrMissing: (routes.screenAttrMissing || 0) + navMissing,
    };
    const pass = overviewTargets.every((o) => o.pass !== false) && inter.unlisted.length === 0
      && (overviewOnly || (routes.failures.length === 0 && routes.offPattern.length === 0 && patternsMissing.length === 0))
      && summary.screenAttrMissing === 0 && (clickBudget.pass !== false || (overviewOnly && (clickBudget.deferred = DEFERRED))) && keyboard.pass !== false;
    return { pass, summary, overviewTargets, unlisted: inter.unlisted, routes, patternsMissing, clickBudget, keyboard,
      dataJson: !!data, overviewOnly: !!overviewOnly, only, runtimeMs: Date.now() - t0, timing, targets: resolve(targetsPath) };
  } finally { await bctx.close(); }
}

// ───────────────────────── 명령 ─────────────────────────

export function parseArgs(argv) {
  const o = {}; const bool = new Set(['overview-only', 'block-fonts', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`알 수 없는 인자: ${a}`);
    const key = a.slice(2);
    if (bool.has(key)) { o[key] = true; continue; }
    const v = argv[++i];
    if (v == null || v.startsWith('--')) throw new Error(`${a} 값 없음`);
    o[key] = v;
  }
  return o;
}

async function main() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`${e.message}\n${USAGE}`); process.exit(2); }
  if (a.help) { console.log(USAGE); return; }
  if (!a.url || !a.targets || (a.only && !SCREENS.includes(a.only))) { console.error(USAGE); process.exit(2); }
  const base = a.url.endsWith('/') ? a.url : `${a.url}/`;
  const served = await fetchJson(`${base}data/overview.json`);
  const browser = await launchBrowser(base);
  let r;
  try { r = await runRoutes(browser, { base, served, targetsPath: resolve(a.targets), overviewOnly: !!a['overview-only'], blockFonts: !!a['block-fonts'], only: a.only || null }); } finally { await browser.close(); }
  if (a.json) { mkdirSync(dirname(resolve(a.json)), { recursive: true }); writeFileSync(resolve(a.json), JSON.stringify(r, null, 2)); }
  console.log(`route-crawl ${r.pass ? 'PASS' : 'FAIL'}${a.only ? ` --only ${a.only}` : ''} ${JSON.stringify(r.summary)} ${r.runtimeMs}ms`);
  const bad = (x) => x && x.pass === false;
  for (const o of r.overviewTargets.filter(bad)) console.log(`  표 요소 실패: ${o.name} ${o.reason || JSON.stringify(o.checks)}`);
  for (const u of r.unlisted.slice(0, 10)) console.log(`  표에 없는 대화형 요소: ${u.at} ${u.text}`);
  if (Array.isArray(r.patternsMissing)) for (const p of r.patternsMissing) console.log(`  개체 없는 패턴: ${p.pattern}`);
  if (Array.isArray(r.routes.failures)) for (const v of r.routes.failures.slice(0, 15)) console.log(`  방문 실패: ${v.hash} ${v.check} ${JSON.stringify(v.content)}${v.errors.length ? ` 오류 ${v.errors[0]}` : ''}${v.screenOk === false ? ` 화면 ${v.screen}` : ''}`);
  if (r.routes.offPattern?.length) console.log(`  패턴 밖 링크: ${r.routes.offPattern.slice(0, 10).join(' ')}`);
  if (bad(r.clickBudget) && !r.clickBudget.deferred) console.log(`  클릭 예산 실패: ${r.clickBudget.reason}`);
  if (bad(r.keyboard)) console.log(`  키보드 실패: ${JSON.stringify(r.keyboard.steps.filter(bad).map((x) => x.step))}`);
  process.exit(r.pass ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.stack || e); process.exit(2); });
