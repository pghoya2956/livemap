// 단위 검사를 JUnit 리포트와 결과 JSON으로 남긴다. 상황판이 결과 JSON(없으면 JUnit)을 읽어 검사 신호와 등급 A를 정한다.
// 검사 폴더는 config.tests.dir, 리포트는 config.tests.report(메타는 같은 이름의 .json), 결과 JSON은 같은 폴더의 test-results.json.
// JUnit 리포터(1.x 호환)와 livemap 리포터를 한 번에 붙여 돌리고, 결과 JSON의 이 실행(러너 node·출처 livemap test-report)을 바꾼다.
// 종료 코드는 러너 종료 코드다. 로컬 스택이 필요한 검사면 개발 머신에서 돌린다.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitStamp, importRuns, resultsPath, toRootPath, writeResults, DEFAULT_REPORT } from './results.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const NODE_REPORTER = join(here, 'reporters', 'node-results.mjs');
export const TEST_REPORT_SOURCE = 'livemap test-report';

export function testReport({ root, cfg }) {
  const dir = cfg?.tests?.dir || 'tests';
  const report = cfg?.tests?.report || DEFAULT_REPORT;
  const abs = (p) => resolve(root, p);
  if (!existsSync(abs(dir))) { console.error(`검사 폴더 없음: ${dir} (config.tests.dir)`); return 2; }
  mkdirSync(dirname(abs(report)), { recursive: true });
  // Node 22.22는 디렉토리 인자를 검사 하나의 실패로 취급하므로 파일 목록을 넘긴다.
  const files = readdirSync(abs(dir)).filter((f) => f.endsWith('.test.mjs')).map((f) => join(dir, f));
  const stamp = gitStamp(root);
  const at = new Date().toISOString();
  const tmp = join(tmpdir(), `livemap-node-results-${process.pid}-${Date.now()}.json`);
  // node --test 안에서 불렸을 때(검사·CI 래퍼) 자식 러너가 재귀 실행으로 파일을 건너뛰지 않게 문맥 변수를 뺀다
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
    '--test-reporter=junit', `--test-reporter-destination=${report}`,
    `--test-reporter=${NODE_REPORTER}`, `--test-reporter-destination=${tmp}`, ...files], { stdio: 'inherit', cwd: root, env });
  const exit = r.status ?? 1;
  const meta = report.replace(/\.xml$/, '.json');
  writeFileSync(abs(meta), JSON.stringify({ sha: stamp.sha, at, exit: r.status }, null, 2));
  // 리포터 출력이 없으면(러너가 뜨지 못함) 파일 없이 종료 코드만 남긴다
  let run = { runner: 'node', sha: stamp.sha, dirtyPaths: stamp.dirtyPaths, at, outsideRoot: 0, files: [] };
  try { run = JSON.parse(readFileSync(tmp, 'utf8')).runs[0]; } catch { /* 위 기본 실행을 쓴다 */ } finally { rmSync(tmp, { force: true }); }
  const results = resultsPath(cfg);
  writeResults(abs(results), { ...run, source: TEST_REPORT_SOURCE, exit });
  console.log(`test report → ${report}, ${results} (sha ${stamp.sha ? stamp.sha.slice(0, 7) : '-'}, exit ${r.status})`);
  return exit;
}

// livemap test-report --import <파일> [--sha <커밋>]: 러너를 돌리지 않고 다른 러너의 출력을 결과 JSON에 넣는다.
// 판별할 수 없거나 파일이 없으면 exit 2이고 결과 JSON을 건드리지 않는다.
export function importReport({ root, cfg, file, sha, cwd = process.cwd() }) {
  if (!file || file.startsWith('--')) { console.error('usage: livemap test-report --import <파일> [--sha <커밋>]'); return 2; }
  const abs = resolve(cwd, file);
  if (!existsSync(abs)) { console.error(`가져올 파일 없음: ${file}`); return 2; }
  const source = toRootPath(root, abs) ?? abs;
  const runs = importRuns({ root, text: readFileSync(abs, 'utf8'), source, sha });
  if (!runs) { console.error(`형식을 판별할 수 없음: ${file} (livemap 리포터 출력·Playwright JSON·JUnit XML)`); return 2; }
  const results = resultsPath(cfg);
  writeResults(resolve(root, results), ...runs);
  for (const r of runs) console.log(`test report import → ${results}: ${r.runner} ${r.source} (파일 ${r.files.length}, sha ${r.sha ? r.sha.slice(0, 7) : '-'})`);
  return 0;
}
