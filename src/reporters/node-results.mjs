// Node 사용자 리포터(패키지 공개 경로): node --test의 test:pass·test:fail 이벤트를 파일별로 세어 결과 JSON 한 실행으로 낸다.
//   node --test --test-reporter=@pghoya2956/livemap/src/reporters/node-results.mjs --test-reporter-destination=map/.out/node-results.json
// Node v22.0.0 문서에 있는 이벤트 필드(file·details.type·skip·todo)만 쓴다. test:summary는 v22.0.0 문서에 없어 쓰지 않는다.
// describe(details.type === 'suite')는 빼고, skip이 있으면 skipped, todo가 있으면 pending이다. 불러오기에 실패한 파일은
// 파일 이름으로 test:fail 하나가 와서 실패 1이 된다. 루트는 러너의 작업 폴더이고, 루트 밖 파일은 빼고 그 수를 outsideRoot에 남긴다.
// 러너 종료 코드는 리포터가 알 수 없어 exit는 null이다(livemap test-report가 채운다).
import { emptyFile, gitStamp, RESULTS_SCHEMA, sortFiles, toRootPath } from '../results.mjs';

const flag = (v) => v !== undefined && v !== null && v !== false;

export default async function* nodeResults(source) {
  const root = process.cwd();
  const at = new Date().toISOString();
  const { sha, dirtyPaths } = gitStamp(root);
  const files = new Map();
  const outside = new Set();
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const d = event.data || {};
    if (d.details?.type === 'suite' || !d.file) continue;
    const filePath = toRootPath(root, d.file);
    if (!filePath) { outside.add(d.file); continue; }
    if (!files.has(filePath)) files.set(filePath, emptyFile(filePath));
    const f = files.get(filePath);
    f.tests += 1;
    if (flag(d.todo)) f.pending += 1;
    else if (flag(d.skip)) f.skipped += 1;
    else if (event.type === 'test:fail') f.failed += 1;
    else f.passed += 1;
  }
  const run = { runner: 'node', source: null, sha, dirtyPaths, at, exit: null, outsideRoot: outside.size, files: sortFiles([...files.values()]) };
  yield JSON.stringify({ schema: RESULTS_SCHEMA, runs: [run] }, null, 2) + '\n';
}
