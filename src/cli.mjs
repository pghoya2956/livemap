// 프로젝트 상황판 CLI. 의존성 없음(Node 22). 명령 진입은 bin/livemap.mjs가 main(argv)를 부른다.
//   livemap build   [--root .] [--out map/.out]       저장소 스캔 → graph.json·data.json·overview.json
//   livemap check   [--root .] [--json] [--strict]     검증(바닥값·라우트 존재·상태 모순·참조 미해결·어댑터 실패) → exit 1이면 실패
//                                                      --json은 stdout에 이슈 계약 JSON만, --strict는 tasks.*·judgment.* 경고도 오류로 센다
//   livemap serve   [--port 4180] [--static <dir>]     loopback 서빙. 기본은 요청마다 재빌드(5초 캐시), --static은 export 폴더를 그대로 준다
//   livemap export  <dir> [--out map/.out]             화면·서체·캡처·생성물을 /map/ 주소 배치 그대로 한 폴더에 모은다
//   livemap init                                       없는 파일만 템플릿으로 만들고 .gitignore·npm 스크립트를 넣는다
//   livemap test-report [--import <파일> [--sha <커밋>]]  단위 검사를 JUnit과 결과 JSON(config.tests.report 폴더의 test-results.json)으로 남긴다.
//                                                      --import는 러너를 돌리지 않고 livemap 리포터·Playwright JSON·JUnit 출력을 결과 JSON에 넣는다
//   livemap --version
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Graph, runAdapter } from './lib/graph.mjs';
import { makeFs } from './lib/util.mjs';
import { derive, overviewSlice } from './derive.mjs';
import { checkProblems } from './check.mjs';
import { applyStrict, problemsJson, textLines } from './lib/issues.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = resolve(here, '..');
export const VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version;
export const ENGINE_MAJOR = Number(VERSION.split('.')[0]);
export const CONFIG = 'map/config.json';
export const MIGRATE_DOC = 'node_modules/@pghoya2956/livemap/docs/migrate.md';

// 기본 어댑터 순서. 순서가 의미 있다: tests·git은 screen·api 노드가 있어야 엣지를 잇고, testreport는 git이 만든 head를 본다.
// config.json의 "adapters" 배열로 바꾼다(프로젝트마다 어댑터 파일을 map/adapters/<name>.mjs 에 둔다).
const DEFAULT_ADAPTERS = ['router', 'bff', 'migrations', 'tests', 'wiki', 'tasks', 'git', 'deploy', 'testreport'];
const adapterCache = new Map();
// 어댑터는 프로젝트(map/adapters/<name>.mjs)가 우선이고, 없으면 엔진에 딸린 참조 어댑터(src/adapters/)를 쓴다.
async function loadAdapter(root, name) {
  const key = `${root}:${name}`;
  if (!adapterCache.has(key)) {
    const project = resolve(root, 'map/adapters', name + '.mjs');
    const reference = resolve(here, 'adapters', name + '.mjs');
    const file = [project, reference].find((f) => existsSync(f));
    if (!file) throw new Error(`어댑터 파일 없음: ${project} | ${reference}`);
    const shadowed = file === project && project !== reference && existsSync(reference);
    adapterCache.set(key, import(pathToFileURL(file).href).then((m) => ({ fn: m.default, shadowed })));
  }
  return adapterCache.get(key);
}

export async function buildGraph(root = process.cwd()) {
  const fs = makeFs(root);
  const cfg = JSON.parse(fs.read(CONFIG));
  const g = new Graph();
  const shadowed = [];
  for (const name of cfg.adapters || DEFAULT_ADAPTERS) {
    let loaded;
    try { loaded = await loadAdapter(root, name); } catch (e) { g.report(name, 'failed', 0, String(e.message)); continue; }
    if (loaded.shadowed) shadowed.push(name);
    runAdapter(g, name, (g) => loaded.fn(g, fs, cfg));
  }
  // 설정에 semantic 키가 없으면 여정 입력이 없는 것으로 본다(없는 키는 뺀다)
  const sem = cfg.semantic && fs.has(cfg.semantic) ? JSON.parse(fs.read(cfg.semantic)) : { journeys: [] };
  const captureExists = (id) => (id && fs.has(`${capturesDir(cfg)}/${id}.jpg`) ? `${id}.jpg` : null);
  const data = derive(g, sem, cfg, { captureExists });
  return { g, cfg, sem, data, fs, shadowed };
}

export async function build(root = process.cwd(), out = resolve(root, 'map/.out')) {
  const r = await buildGraph(root);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'graph.json'), JSON.stringify(r.g.toJSON()));
  writeFileSync(join(out, 'data.json'), JSON.stringify(r.data));
  writeFileSync(join(out, 'overview.json'), JSON.stringify(overviewSlice(r.data, { sinceDays: r.cfg.git?.sinceDays })));
  return r;
}

export const capturesDir = (cfg) => cfg?.captures?.site || 'map/captures';

// config.json의 engine(major)이 이 엔진과 다르면 멈춘다. 키가 없으면 1로 본다.
export function engineMismatch(cfg) {
  const want = cfg?.engine ?? 1;
  if (Number(want) === ENGINE_MAJOR) return null;
  return `${CONFIG}의 engine ${want}이 이 엔진(${VERSION}, major ${ENGINE_MAJOR})과 다릅니다. 이행 방법: ${MIGRATE_DOC}`;
}

const USAGE = `usage: livemap <command>
  build        [--root .] [--out map/.out]    저장소 스캔 → graph.json · data.json · overview.json
  check        [--root .] [--json] [--strict] 정합 검사, 오류가 있으면 exit 1(--json: 이슈 JSON만)
  serve        [--port 4180] [--static <dir>] 로컬 뷰 http://127.0.0.1:<port>/map/
  export <dir> [--out map/.out]               화면·서체·캡처·생성물을 한 폴더에(먼저 build)
  init                                        map/ 초안 파일·.gitignore·npm 스크립트
  test-report                                 단위 검사를 JUnit 리포트와 결과 JSON으로
  test-report --import <파일> [--sha <커밋>]  Playwright JSON·JUnit·livemap 리포터 출력을 결과 JSON에
  --version                                   엔진 버전`;

function readConfig(root) {
  const file = resolve(root, CONFIG);
  if (!existsSync(file)) return { error: `${CONFIG} 없음: 프로젝트 루트에서 실행하거나 먼저 livemap init` };
  try { return { cfg: JSON.parse(readFileSync(file, 'utf8')) }; }
  catch (e) { return { error: `${CONFIG} 읽기 실패: ${e.message}` }; }
}

// 명령을 실행하고 종료 코드를 돌려준다. serve는 서버를 띄우고 undefined를 돌려준다(프로세스가 계속 산다).
export async function main(argv = []) {
  const cmd = argv[0] || 'build';
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') { console.log(VERSION); return 0; }
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(USAGE); return 0; }
  if (cmd === 'init') { const { init } = await import('./init.mjs'); return init({ root: process.cwd(), pkgRoot: PKG_ROOT }); }

  const root = resolve(opt('root', process.cwd()));
  const out = resolve(root, opt('out', 'map/.out'));
  if (!['build', 'check', 'serve', 'export', 'test-report'].includes(cmd)) { console.error(USAGE); return 2; }

  const staticDir = cmd === 'serve' ? opt('static') : undefined;
  let cfg = null;
  if (!staticDir) {
    const r = readConfig(root);
    if (r.error) { console.error(r.error); return 2; }
    cfg = r.cfg;
    const mismatch = engineMismatch(cfg);
    if (mismatch) { console.error(mismatch); return 2; }
  }
  const notifyShadow = (names) => { for (const n of names) console.log(`프로젝트 어댑터가 참조 어댑터를 가림: ${n}`); };

  if (cmd === 'build') {
    const { data: d, shadowed } = await build(root, out);
    notifyShadow(shadowed);
    const bad = d.adapters.filter((a) => a.status !== 'ok');
    console.log(`map build → ${out}: 화면 ${d.summary.routes} · API ${d.summary.apis} · 함수 ${d.summary.dbFunctions} · 작업 ${d.tasks.length} · 커밋 ${d.summary.commits} · 경고 ${d.summary.warnings} · 고아 ${d.summary.orphans}`);
    for (const a of bad) console.log(`  ${a.status === 'failed' ? '✗' : '△'} ${a.name}: ${a.error}`);
    return 0;
  }
  if (cmd === 'check') {
    const json = argv.includes('--json');
    // --json: stdout에는 JSON만. 빌드 중 어댑터가 찍는 줄과 가림 알림은 stderr로 보낸다
    const log = console.log;
    if (json) console.log = (...a) => console.error(...a);
    let built;
    try { built = await buildGraph(root); } finally { console.log = log; }
    const { data, cfg: c, shadowed } = built;
    if (json) for (const n of shadowed) console.error(`프로젝트 어댑터가 참조 어댑터를 가림: ${n}`);
    else notifyShadow(shadowed);
    const problems = applyStrict(checkProblems(data, c), argv.includes('--strict'));
    const errors = problems.filter((p) => p.level === 'error').length;
    if (json) {
      process.stdout.write(JSON.stringify(problemsJson(problems, VERSION), null, 2) + '\n');
      return errors ? 1 : 0;
    }
    for (const line of textLines(problems)) console.log(line);
    console.log(errors ? `map check: 오류 ${errors}` : `map check: 통과 (경고 ${problems.length})`);
    return errors ? 1 : 0;
  }
  if (cmd === 'serve') {
    const { serve } = await import('./serve.mjs');
    const port = Number(opt('port', 4180));
    if (staticDir) {
      const dir = resolve(process.cwd(), staticDir);
      if (!existsSync(join(dir, 'index.html'))) { console.error(`export 폴더가 아님(index.html 없음): ${dir}`); return 2; }
      serve({ port, static: dir });
    } else {
      serve({ root, out, port, captures: resolve(root, capturesDir(cfg)), build: () => build(root, out) });
    }
    return undefined;
  }
  if (cmd === 'export') {
    const target = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
    if (!target) { console.error('usage: livemap export <dir> [--out map/.out]'); return 2; }
    const { exportSite } = await import('./serve.mjs');
    return exportSite({ root, out, captures: resolve(root, capturesDir(cfg)), target: resolve(process.cwd(), target) });
  }
  if (cmd === 'test-report') {
    const { testReport, importReport } = await import('./test-report.mjs');
    if (argv.includes('--import')) return importReport({ root, cfg, file: opt('import'), sha: opt('sha') });
    return testReport({ root, cfg });
  }
  return 2;
}
