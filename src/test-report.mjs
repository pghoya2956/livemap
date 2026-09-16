// 단위 검사를 JUnit 리포트로 남기고 기준 커밋·시각을 옆에 적는다. 상황판이 이 둘을 읽어 "최신 커밋에서 통과"(등급 A)를 판정한다.
// 검사 폴더는 config.tests.dir, 리포트는 config.tests.report(메타는 같은 이름의 .json). 로컬 스택이 필요한 검사면 개발 머신에서 돌린다.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function testReport({ root, cfg }) {
  const dir = cfg?.tests?.dir || 'tests';
  const report = cfg?.tests?.report || 'map/.out/junit.xml';
  const abs = (p) => resolve(root, p);
  if (!existsSync(abs(dir))) { console.error(`검사 폴더 없음: ${dir} (config.tests.dir)`); return 2; }
  mkdirSync(dirname(abs(report)), { recursive: true });
  // Node 22.22는 디렉토리 인자를 검사 하나의 실패로 취급하므로 파일 목록을 넘긴다.
  const files = readdirSync(abs(dir)).filter((f) => f.endsWith('.test.mjs')).map((f) => join(dir, f));
  const r = spawnSync('node', ['--test', '--test-concurrency=1', '--test-reporter=junit', `--test-reporter-destination=${report}`, ...files], { stdio: 'inherit', cwd: root });
  let sha = null;
  try { sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* git 저장소가 아니면 기준 커밋 없음 */ }
  const meta = report.replace(/\.xml$/, '.json');
  writeFileSync(abs(meta), JSON.stringify({ sha, at: new Date().toISOString(), exit: r.status }, null, 2));
  console.log(`test report → ${report} (sha ${sha ? sha.slice(0, 7) : '-'}, exit ${r.status})`);
  return r.status ?? 1;
}
