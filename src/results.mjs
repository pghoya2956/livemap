// 결과 JSON: 러너가 낸 검사 결과를 파일별로 모은 livemap 소유 형식(필드 이름은 CTRF를 따른다).
//   { schema: 1, runs: [{ runner, source, sha, dirtyPaths, at, exit, outsideRoot?, stamped?, files: [{ filePath, tests, passed, failed, skipped, pending, tags }] }] }
// 경로는 tests.report와 같은 폴더의 test-results.json. 같은 러너·같은 출처의 실행은 바꾸고 나머지는 남긴다.
// 쓰기는 임시 파일에 쓴 뒤 이름을 바꿔, 두 실행이 동시에 써도 파일이 깨지지 않고 나중 실행이 남는다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const RESULTS_SCHEMA = 1;
export const RESULTS_NAME = 'test-results.json';
export const DEFAULT_REPORT = 'map/.out/junit.xml';

// 프로젝트 루트 기준 결과 JSON 경로
export const resultsPath = (cfg) => join(dirname(cfg?.tests?.report || DEFAULT_REPORT), RESULTS_NAME);

export const emptyResults = () => ({ schema: RESULTS_SCHEMA, runs: [] });

export function readResults(file) {
  if (!existsSync(file)) return emptyResults();
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`결과 JSON을 읽지 못함(${file}): ${e.message}`); }
  if (!doc || doc.schema !== RESULTS_SCHEMA || !Array.isArray(doc.runs)) throw new Error(`결과 JSON 형식이 아님(${file}): schema ${RESULTS_SCHEMA}·runs 배열 필요`);
  return doc;
}

const sameRun = (a, b) => a.runner === b.runner && a.source === b.source;

// 같은 러너·출처의 실행은 그 자리에서 바꾸고, 없으면 뒤에 붙인다
export function mergeRun(doc, run) {
  const runs = doc.runs.slice();
  const i = runs.findIndex((r) => sameRun(r, run));
  if (i >= 0) runs[i] = run; else runs.push(run);
  return { ...doc, schema: RESULTS_SCHEMA, runs };
}

export function writeResults(file, ...runs) {
  let doc = readResults(file);
  for (const run of runs) doc = mergeRun(doc, run);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  renameSync(tmp, file);
  return doc;
}

// 실행 시점 기준 커밋과 작업트리 변경 경로(루트 기준 상대). git이 없으면 sha null·빈 목록
export function gitStamp(root) {
  const run = (...a) => { try { return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const sha = run('rev-parse', 'HEAD')?.trim() || null;
  if (!sha) return { sha: null, dirtyPaths: [] };
  const prefix = run('rev-parse', '--show-prefix')?.trim() || '';
  // -z: 경로 인용 없음. 이름 바꾸기(R)·복사(C)는 새 경로 뒤에 원래 경로가 한 칸 더 온다
  const parts = (run('status', '--porcelain=v1', '-z', '--', '.') || '').split('\0');
  const paths = new Set();
  for (let i = 0; i < parts.length; i += 1) {
    const e = parts[i];
    if (e.length < 4) continue;
    paths.add(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C') { i += 1; if (parts[i]) paths.add(parts[i]); }
  }
  const dirtyPaths = [...paths].map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p)).sort();
  return { sha, dirtyPaths };
}

// 절대 경로(또는 file URL)를 루트 기준 상대 경로로. 루트 밖이면 null.
// 러너는 심볼릭 링크를 푼 실제 경로를 적기도 하므로(macOS /var → /private/var) 밖으로 보이면 양쪽 실제 경로로 한 번 더 본다
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
export function toRootPath(root, p) {
  let file = String(p);
  if (file.startsWith('file://')) file = new URL(file).pathname;
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const inside = (r) => (r && !r.startsWith('..') && !isAbsolute(r) ? r.split('\\').join('/') : null);
  return inside(relative(root, abs)) ?? inside(relative(real(root), real(abs)));
}

export const emptyFile = (filePath) => ({ filePath, tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, tags: [] });
export const sortFiles = (files) => files.slice().sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));

// ---- import: livemap 리포터 출력·Playwright JSON 리포터 출력·JUnit XML 판별과 해석 ----

// 형식 이름(livemap·playwright·junit) 또는 null
export function detectFormat(text) {
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  if (json !== undefined) {
    if (json && json.schema === RESULTS_SCHEMA && Array.isArray(json.runs)) return 'livemap';
    if (json && json.config && typeof json.config === 'object' && Array.isArray(json.suites)) return 'playwright';
    return null;
  }
  return /<(testsuites|testsuite|testcase)\b/.test(text) ? 'junit' : null;
}

const add = (a, b) => { for (const k of ['tests', 'passed', 'failed', 'skipped', 'pending']) a[k] += b[k] || 0; return a; };
export const totalsOf = (files) => files.reduce((t, f) => add(t, f), { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0 });

// Playwright 1.63.0 JSON: 파일은 config.rootDir + suites[].file(중첩 suite 포함), 결과는 tests[].status, 태그는 specs[].tags
export function parsePlaywright(report, root) {
  const rootDir = typeof report.config?.rootDir === 'string' ? report.config.rootDir : root;
  const files = new Map();
  const outside = new Set();
  const visit = (suite, parentFile) => {
    const suiteFile = suite.file || parentFile;
    for (const spec of suite.specs || []) {
      const name = spec.file || suiteFile;
      if (!name) continue;
      const filePath = toRootPath(root, resolve(rootDir, name));
      if (!filePath) { outside.add(resolve(rootDir, name)); continue; }
      if (!files.has(filePath)) files.set(filePath, { ...emptyFile(filePath), flaky: 0 });
      const f = files.get(filePath);
      for (const tag of spec.tags || []) if (!f.tags.includes(tag)) f.tags.push(tag);
      for (const t of spec.tests || []) {
        f.tests += 1;
        if (t.status === 'expected') f.passed += 1;
        else if (t.status === 'flaky') { f.passed += 1; f.flaky += 1; } else if (t.status === 'skipped') f.skipped += 1;
        else f.failed += 1; // unexpected
      }
    }
    for (const child of suite.suites || []) visit(child, suiteFile);
  };
  for (const s of report.suites) visit(s, null);
  const list = sortFiles([...files.values()]).map((f) => ({ ...f, tags: f.tags.slice().sort() }));
  // 필드 순서를 리포터 출력과 맞춘다(flaky는 pending 뒤)
  const ordered = list.map(({ filePath, tests, passed, failed, skipped, pending, flaky, tags }) => ({ filePath, tests, passed, failed, skipped, pending, flaky, tags }));
  return { runner: 'playwright', at: report.stats?.startTime || null, outsideRoot: outside.size, files: ordered };
}

const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENTITIES[e.toLowerCase()]));
const attrsOf = (s) => Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], unescapeXml(m[2] ?? m[3])]));

// JUnit XML: 최상위·중첩 <testcase>를 모두 센다. file 속성(testcase 또는 감싼 testsuite)이 있으면 파일별로 나누고,
// 없으면 실행 전체(totals)에만 더한다. todo로 건너뛴 검사는 pending, failure·error는 failed, skipped는 skipped다.
// 어댑터의 JUnit 호환 읽기와 import가 이 해석기 하나를 쓴다.
export function parseJunit(xml, root) {
  const tag = /<(\/?)(testsuite|testcase|skipped|failure|error)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const body = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const suites = [];
  const files = new Map();
  const totals = { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0 };
  const outside = new Set();
  let current = null;
  let at = null;
  const close = (c) => {
    const one = { tests: 1, passed: 0, failed: 0, skipped: 0, pending: 0 };
    if (c.todo) one.pending = 1; else if (c.failed) one.failed = 1; else if (c.skipped) one.skipped = 1; else one.passed = 1;
    add(totals, one);
    const raw = c.file || [...suites].reverse().find((s) => s.file)?.file;
    if (!raw) return;
    const filePath = toRootPath(root, raw);
    if (!filePath) { outside.add(raw); return; }
    if (!files.has(filePath)) files.set(filePath, emptyFile(filePath));
    add(files.get(filePath), one);
  };
  for (const m of body.matchAll(tag)) {
    const [, end, name, rawAttrs, selfClose] = m;
    const a = attrsOf(rawAttrs);
    if (name === 'testsuite') {
      if (end) suites.pop();
      else { at ||= a.timestamp || null; if (!selfClose) suites.push(a); }
    } else if (name === 'testcase') {
      if (end) { if (current) close(current); current = null; }
      else {
        const c = { file: a.file || null, failed: false, skipped: false, todo: false };
        if (selfClose) close(c); else current = c;
      }
    } else if (current && !end) {
      if (name === 'skipped') { if (a.type === 'todo') current.todo = true; else current.skipped = true; }
      else current.failed = true;
    }
  }
  return { runner: 'junit', at, outsideRoot: outside.size, files: sortFiles([...files.values()]), totals };
}

// 가져올 파일 하나를 결과 JSON 실행 목록으로 바꾼다. 판별할 수 없으면 null.
// livemap 리포터 출력은 그 sha·dirtyPaths·at를 지키고 출처가 비었으면 가져온 파일 경로를 적는다.
// Playwright·JUnit은 sha가 없으므로 sha(--sha, 없으면 현재 HEAD)와 현재 dirtyPaths를 적고 stamped "import"를 남긴다.
export function importRuns({ root, text, source, sha }) {
  const format = detectFormat(text);
  if (!format) return null;
  if (format === 'livemap') return JSON.parse(text).runs.map((r) => ({ ...r, source: r.source ?? source }));
  const stamp = gitStamp(root);
  const parsed = format === 'playwright' ? parsePlaywright(JSON.parse(text), root) : parseJunit(text, root);
  const { runner, at, outsideRoot, files, totals } = parsed;
  const run = { runner, source, stamped: 'import', sha: sha || stamp.sha, dirtyPaths: stamp.dirtyPaths, at: at || new Date().toISOString(), exit: null, outsideRoot, files };
  if (totals) run.totals = totals;
  return [run];
}
