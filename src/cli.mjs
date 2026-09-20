// 프로젝트 상황판 CLI. 의존성 없음(Node 22). 명령 진입은 bin/livemap.mjs가 main(argv)를 부른다.
//   livemap build   [--root .] [--out map/.out]       저장소 스캔 → graph.json·data.json·overview.json(+ 구조 지도가 켜진 프로젝트는 architecture.md·architecture.json·스킬 사본)
//   livemap check   [--root .] [--json] [--strict]     검증(바닥값·라우트 존재·상태 모순·참조 미해결·어댑터 실패) → exit 1이면 실패
//                                                      --json은 stdout에 이슈 계약 JSON만, --strict는 tasks.*·judgment.* 경고도 오류로 센다
//                  [--staged]                          커밋 전 훅: 스테이징된 작업 문서·판정 파일에 걸린 tasks.*·judgment.*만 오류로 센다(git 없음·대상 없음 0)
//   livemap serve   [--port 4180] [--static <dir>]     loopback 서빙. 기본은 요청마다 재빌드(5초 캐시), --static은 export 폴더를 그대로 준다
//   livemap export  <dir> [--out map/.out]             화면·서체·캡처·생성물을 /map/ 주소 배치 그대로 한 폴더에 모은다
//   livemap init                                       없는 파일만 템플릿으로 만들고 .gitignore·npm 스크립트·커밋 전 훅(.githooks/pre-commit)을 넣는다
//   livemap test-report [--import <파일> [--sha <커밋>]]  단위 검사를 JUnit과 결과 JSON(config.tests.report 폴더의 test-results.json)으로 남긴다.
//                                                      --import는 러너를 돌리지 않고 livemap 리포터·Playwright JSON·JUnit 출력을 결과 JSON에 넣는다
//   livemap --version
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Graph, runAdapter } from './lib/graph.mjs';
import { makeFs } from './lib/util.mjs';
import { readJourneysDir } from './lib/journeys-md.mjs';
import { derive, overviewSlice } from './derive.mjs';
import { execFileSync } from 'node:child_process';
import { checkProblems, stagedTargets, stagedProblems, stagedText } from './check.mjs';
import { linkScreenApis } from './link.mjs';
import { bridgeArchitecture } from './bridge.mjs';
import { architectureStage } from './architecture.mjs';
import { architectureOutputs } from './reporters/architecture-md.mjs';
import { applyStrict, problemsJson, sortProblems, textLines } from './lib/issues.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = resolve(here, '..');
export const VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version;
export const ENGINE_MAJOR = Number(VERSION.split('.')[0]);
export const CONFIG = 'map/config.json';
export const MIGRATE_DOC = 'node_modules/@pghoya2956/livemap/docs/migrate.md';

// 기본 어댑터 순서. 순서가 의미 있다: tests·git은 screen·api 노드가 있어야 엣지를 잇고, testreport는 git이 만든 head를 본다.
// graphify(2.1.0)는 migrations 가 만든 function·table 노드에 Graphify 증거를 덧붙이므로 그 바로 뒤다.
// config.json의 "adapters" 배열로 바꾼다(프로젝트마다 어댑터 파일을 map/adapters/<name>.mjs 에 둔다).
const DEFAULT_ADAPTERS = ['router', 'bff', 'migrations', 'graphify', 'tests', 'wiki', 'tasks', 'git', 'deploy', 'testreport'];
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

// 여정 정본을 읽는다. 경로가 .json이면 그 파일, 아니면 디렉터리로 보고 역할 md를 읽는다.
// 디렉터리를 읽을 때 화면·캡처·참조는 프로젝트 대응표(설정 journeyScreens, 기본 map/journey-screens.json)에서 온다.
export function readSemantic(fs, cfg) {
  const path = cfg.semantic;
  if (!path || !fs.has(path)) return { journeys: [] };
  if (path.endsWith('.json')) return JSON.parse(fs.read(path));
  const mapFile = cfg.journeyScreens || 'map/journey-screens.json';
  let map = {};
  if (fs.has(mapFile)) { try { map = JSON.parse(fs.read(mapFile)); } catch (e) { throw new Error(`${mapFile} 읽기 실패: ${e.message}`); } }
  const sem = readJourneysDir(fs, path, { map, project: cfg.project });
  // 읽을 역할 파일이 있는데 여정이 0건이면 읽기가 조용히 빈 것이다(파일 없음·빈 폴더와 구분한다)
  const roleFiles = fs.ls(path).filter((f) => f.endsWith('.md') && f !== 'README.md');
  if (roleFiles.length && !sem.journeys.length) sem.readEmpty = `${path}에 역할 파일 ${roleFiles.length}개가 있는데 읽힌 여정이 0건`;
  return sem;
}

export async function buildGraph(root = process.cwd(), { semantic = null } = {}) {
  const fs = makeFs(root);
  const cfg = JSON.parse(fs.read(CONFIG));
  if (semantic) cfg.semantic = semantic; // --semantic: 다른 판의 여정 정본으로 산출을 재현할 때
  const g = new Graph();
  const shadowed = [];
  for (const name of cfg.adapters || DEFAULT_ADAPTERS) {
    let loaded;
    try { loaded = await loadAdapter(root, name); } catch (e) { g.report(name, 'failed', 0, String(e.message)); continue; }
    if (loaded.shadowed) shadowed.push(name);
    runAdapter(g, name, (g) => loaded.fn(g, fs, cfg));
  }
  // 연결 단계: 모든 어댑터 뒤에 화면 리터럴을 API 노드에 잇는다. adapters[]에 들지 않고, 실패하면 오류 이슈로 남긴다
  try { linkScreenApis(g, fs, cfg); } catch (e) { g.issue('error', '연결 단계', String(e?.message || e)); }
  // 다리 단계(2.1.0): 연결 단계가 만든 calls 를 읽기만 하고 화면·API 를 Graphify 파일 노드와 로그인 노드에 잇는다(DEC-42). graphify 어댑터가 없으면 아무것도 하지 않는다
  try { bridgeArchitecture(g, fs, cfg); } catch (e) { g.issue('error', '다리 단계', String(e?.message || e)); }
  // 여정 정본: 디렉터리면 역할별 md(2.0.0), .json이면 한 파일(1.x 호환). 설정에 semantic 키가 없으면 여정 입력이 없다
  const sem = readSemantic(fs, cfg);
  // architecture 단계(2.1.0): 다리가 놓인 그래프에 선언(map/architecture/)을 대조한다. 설정 architecture.dir 이 없으면 partial 이다. 실패는 오류 이슈로 남긴다
  try { architectureStage(g, fs, cfg, sem); } catch (e) { g.issue('error', '구조 단계', String(e?.message || e)); }
  const captureExists = (id) => (id && fs.has(`${capturesDir(cfg)}/${id}.jpg`) ? `${id}.jpg` : null);
  const data = derive(g, sem, cfg, { captureExists });
  // 구조 산출물(2.1.0): architecture.md 본문·architecture.json·스킬 사본을 만들고 상한·낡음 판정을 이슈로 남긴다(check 가 본다). 절이 없는 프로젝트는 null
  const outputs = architectureOutputs(g, data, cfg, fs, { version: VERSION });
  if (outputs) { for (const i of outputs.issues) g.issue(i.level, i.label, i.message, i.detail); data.issues = g.issues.map((i) => ({ ...i })); }
  return { g, cfg, sem, data, fs, shadowed, outputs };
}

export async function build(root = process.cwd(), out = resolve(root, 'map/.out'), opts = {}) {
  const r = await buildGraph(root, opts);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'graph.json'), JSON.stringify(r.g.toJSON()));
  writeFileSync(join(out, 'data.json'), JSON.stringify(r.data));
  writeFileSync(join(out, 'overview.json'), JSON.stringify(overviewSlice(r.data, { sinceDays: r.cfg.git?.sinceDays })));
  if (r.outputs) {
    writeFileSync(join(out, 'architecture.md'), r.outputs.md);
    writeFileSync(join(out, 'architecture.json'), JSON.stringify(r.outputs.json));
    // 스킬 사본(architecture.skillFile): 발견 방식만 다른 같은 본문. 정본은 빌드 산출물이고 사본은 커밋되므로 낡음을 check 가 본다
    if (r.outputs.copy) { const file = resolve(root, r.outputs.copy.path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, r.outputs.copy.text); }
  }
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
  build        [--root .] [--out map/.out] [--semantic <경로>]
                                              저장소 스캔 → graph.json · data.json · overview.json
  check        [--root .] [--json] [--strict] [--semantic <경로>] 정합 검사, 오류가 있으면 exit 1(--json: 이슈 JSON만)
  check --staged                              커밋 전 훅: 스테이징된 작업 문서·판정 파일의 문제만 오류로
  serve        [--port 4180] [--static <dir>] 로컬 뷰 http://127.0.0.1:<port>/map/
  export <dir> [--out map/.out]               화면·서체·캡처·생성물을 한 폴더에(먼저 build)
  init                                        map/ 초안 파일·.gitignore·npm 스크립트·커밋 전 훅
  affected     [--base <ref>]                 바뀐 화면을 지나는 브라우저 검사와 실행 명령
  test-report                                 단위 검사를 JUnit 리포트와 결과 JSON으로
  test-report --import <파일> [--sha <커밋>]  Playwright JSON·JUnit·livemap 리포터 출력을 결과 JSON에
  --version                                   엔진 버전`;

// 값을 뒤에 받는 플래그. 그 값 자리에 온 --help 는 도움말 요청이 아니다
const VALUE_FLAGS = new Set(['--root', '--out', '--semantic', '--port', '--static', '--base', '--import', '--sha']);

function readConfig(root) {
  const file = resolve(root, CONFIG);
  if (!existsSync(file)) return { error: `${CONFIG} 없음: 프로젝트 루트에서 실행하거나 먼저 livemap init` };
  try { return { cfg: JSON.parse(readFileSync(file, 'utf8')) }; }
  catch (e) { return { error: `${CONFIG} 읽기 실패: ${e.message}` }; }
}

// 명령을 실행하고 종료 코드를 돌려준다. serve는 서버를 띄우고 undefined를 돌려준다(프로세스가 계속 산다).
// check --staged: 스테이징 목록(git diff --cached, 내용은 작업트리 기준)에 작업 문서·판정 파일이 없으면 빌드하지 않고 0
const STAGED_FAIL = '원문을 식별자 줄 규칙대로 고치거나 map/judgments/<작업 폴더>.json에 판정을 적어 스테이징하고 다시 커밋한다. --no-verify로 넘기지 않는다';
async function checkStaged(root, cfg, json) {
  let paths;
  try {
    const out = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '--relative', '--no-renames', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    paths = out.split('\0').filter(Boolean);
  } catch {
    if (json) process.stdout.write(JSON.stringify(problemsJson([], VERSION), null, 2) + '\n');
    else console.log('map check --staged: git 저장소 아님, 건너뜀');
    return 0;
  }
  const targets = stagedTargets(paths, cfg);
  if (!targets.length) {
    if (json) process.stdout.write(JSON.stringify(problemsJson([], VERSION), null, 2) + '\n');
    else console.log('map check --staged: 대상 없음');
    return 0;
  }
  // 빌드 중 어댑터가 찍는 줄은 훅 출력에 섞지 않는다
  const log = console.log;
  console.log = (...a) => console.error(...a);
  let built;
  try { built = await buildGraph(root); } finally { console.log = log; }
  const problems = sortProblems(stagedProblems(checkProblems(built.data, built.cfg), paths, built.cfg));
  if (json) { process.stdout.write(JSON.stringify(problemsJson(problems, VERSION), null, 2) + '\n'); return problems.length ? 1 : 0; }
  if (!problems.length) { console.log(`map check --staged: 통과 (대상 파일 ${targets.length})`); return 0; }
  for (const line of stagedText(problems)) console.log(line);
  console.log(`map check --staged: 오류 ${problems.length} (스테이징된 작업 문서·판정 파일의 tasks.*·judgment.* 문제). ${STAGED_FAIL}`);
  return 1;
}

export async function main(argv = []) {
  const cmd = argv[0] || 'build';
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') { console.log(VERSION); return 0; }
  // 하위 명령 뒤에 붙인 --help·-h 도 도움말이다. 값이 필요한 플래그의 값 자리는 빼서 --out --help 같은 경우를 건드리지 않는다.
  // 이 줄이 없으면 도움말을 물은 사람이 명령을 실행당한다. init 은 파일을 쓰므로 그 피해가 실제였다.
  if (cmd === 'help' || argv.some((a, i) => (a === '--help' || a === '-h') && !VALUE_FLAGS.has(argv[i - 1]))) { console.log(USAGE); return 0; }
  if (cmd === 'init') { const { init } = await import('./init.mjs'); return init({ root: process.cwd(), pkgRoot: PKG_ROOT }); }

  const root = resolve(opt('root', process.cwd()));
  const out = resolve(root, opt('out', 'map/.out'));
  if (!['build', 'check', 'serve', 'export', 'test-report', 'affected'].includes(cmd)) { console.error(USAGE); return 2; }

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
    const { data: d, shadowed } = await build(root, out, { semantic: opt('semantic', null) });
    notifyShadow(shadowed);
    const bad = d.adapters.filter((a) => a.status !== 'ok');
    const arch = d.architecture ? ` · 부품 ${d.summary.containers} · 묶음 ${d.summary.communities}` : '';
    console.log(`map build → ${out}: 화면 ${d.summary.routes} · API ${d.summary.apis} · 함수 ${d.summary.dbFunctions}${arch} · 작업 ${d.tasks.length} · 커밋 ${d.summary.commits} · 경고 ${d.summary.warnings} · 고아 ${d.summary.orphans}${d.architecture ? ` · 어긋남 ${d.summary.boundaryViolations}` : ''}`);
    for (const a of bad) console.log(`  ${a.status === 'failed' ? '✗' : '△'} ${a.name}: ${a.error}`);
    return 0;
  }
  if (cmd === 'check' && argv.includes('--staged')) return checkStaged(root, cfg, argv.includes('--json'));
  if (cmd === 'check') {
    const semOverride = opt('semantic', null);
    const json = argv.includes('--json');
    // --json: stdout에는 JSON만. 빌드 중 어댑터가 찍는 줄과 가림 알림은 stderr로 보낸다
    const log = console.log;
    if (json) console.log = (...a) => console.error(...a);
    let built;
    try { built = await buildGraph(root, { semantic: semOverride }); } finally { console.log = log; }
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
  if (cmd === 'affected') {
    const { affected, affectedText } = await import('./affected.mjs');
    const r = await affected({ root, base: opt('base', null) });
    for (const line of affectedText(r)) console.log(line);
    return 0;
  }
  if (cmd === 'test-report') {
    const { testReport, importReport } = await import('./test-report.mjs');
    if (argv.includes('--import')) return importReport({ root, cfg, file: opt('import'), sha: opt('sha') });
    return testReport({ root, cfg });
  }
  return 2;
}
