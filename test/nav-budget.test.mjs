// budget.nav-items-low 검사(스펙 PN-18, DEC-12): 엔진 내비 수의 정본은 src/check.mjs 의 NAV_ITEMS 이고 ui/lib/route.js 의 NAV 길이와 같아야 한다.
// 팩 files 에 ui/ 가 없어 엔진이 런타임에 route.js 를 읽을 수 없기 때문에 상수와 검사로 묶는다. budget.navItems 가 그보다 작으면 경고 한 줄, --strict 에서도 경고다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV_ITEMS, checkProblems } from '../src/check.mjs';
import { NAV } from '../ui/lib/route.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(resolve(HERE, '..'), 'bin', 'livemap.mjs');
const MINI = join(HERE, 'fixtures', 'mini');
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

test('SC-19 NAV_ITEMS 는 화면 NAV 길이와 같다(NAV 를 늘리면 상수도 함께 올린다)', () => {
  assert.equal(NAV_ITEMS, NAV.length);
  assert.equal(NAV_ITEMS, 6);
  assert.deepEqual(NAV, ['overview', 'journeys', 'architecture', 'roadmap', 'tasks', 'more']);
});

test('SC-19 budget.navItems 가 NAV_ITEMS 보다 작으면 budget.nav-items-low 한 줄, 같거나 크거나 없으면 없음', () => {
  const d = { adapters: [], semantic: { journeys: [] }, summary: { routes: 0, apis: 0, dbFunctions: 0 }, tests: [], tasks: [], decisions: [], roadmap: [], milestones: [], orphans: { screens: [], apis: [], tests: [] }, deploy: null, issues: [] };
  const low = checkProblems(d, { budget: { navItems: 5 } }).filter((p) => p.code === 'budget.nav-items-low');
  assert.equal(low.length, 1);
  assert.deepEqual([low[0].level, low[0].subject, low[0].resolutions], ['warn', { kind: 'config', id: 'budget.navItems' }, ['config']]);
  assert.match(low[0].msg, /5.*6/);
  assert.equal(checkProblems(d, { budget: { navItems: 6 } }).filter((p) => p.code === 'budget.nav-items-low').length, 0);
  assert.equal(checkProblems(d, { budget: { navItems: 7 } }).filter((p) => p.code === 'budget.nav-items-low').length, 0);
  assert.equal(checkProblems(d, {}).filter((p) => p.code === 'budget.nav-items-low').length, 0);
});

test('SC-19 명령: mini 사본의 navItems 를 5 로 두면 check 에 budget.nav-items-low 한 줄이고 --strict 에서도 경고(종료 코드는 기존 오류 때문에 1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'livemap nav 예산 검사-'));
  made.push(dir);
  cpSync(MINI, dir, { recursive: true });
  const cfgFile = join(dir, 'map/config.json');
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
  cfg.budget.navItems = 5;
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  const run = (args) => spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8' }).stdout;
  assert.equal((run(['check']).match(/budget\.nav-items-low/g) || []).length, 1);
  const j = JSON.parse(run(['check', '--json', '--strict']));
  assert.deepEqual(j.problems.filter((p) => p.code === 'budget.nav-items-low').map((p) => p.level), ['warn']);
  cfg.budget.navItems = 6;
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  assert.equal((run(['check']).match(/budget\.nav-items-low/g) || []).length, 0);
});
