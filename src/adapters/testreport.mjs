// 검사 결과 어댑터: 결과 JSON(tests.report 폴더의 test-results.json)을 먼저 읽고, 없으면 JUnit(tests.report)과 옆 메타를 같은 해석기로 읽는다.
// 둘 다 없으면 1.1.1 문구를 그대로 돌려준다(골든 1.0.1이 adapters[]·adapterNotes에서 위치로 비교한다).
// 최신(DEC-18): 실행 sha가 git 어댑터의 HEAD와 같거나 조상이고, 그 뒤 커밋과 실행 때 바뀐 경로(dirtyPaths)가 문서 경로 밖을 건드리지 않으면 최신이다.
// 문서 경로는 설정 키에서만 정한다: tasks.dir, wiki.index 폴더, semantic, roadmap.file, captures.site, deploy.manifest, map/judgments.
// 검사 노드(id = 파일 경로)와 결과 filePath를 그대로 맞춘다. 결과가 없거나 파일별 결과가 없는 검사의 lastRun 읽기 상태는 unknown이다.
import { posix } from 'node:path';
import { parseJunit, readResults, resultsPath, totalsOf } from '../results.mjs';
import { setReading } from '../lib/reading.mjs';

const NO_REPORT = '검사 리포트 없음(npm run test:report 미실행)';
const NO_HISTORY = '결과 커밋이 이력에 없음';

export function docPaths(cfg) {
  const wikiDir = cfg.wiki?.index ? posix.dirname(cfg.wiki.index) : null;
  const paths = [
    cfg.tasks?.dir,
    // 위키 인덱스가 루트에 있으면 폴더 대신 그 파일만 문서 경로로 본다(루트 전체가 문서가 되지 않게)
    wikiDir && wikiDir !== '.' ? wikiDir : cfg.wiki?.index,
    cfg.semantic, cfg.roadmap?.file, cfg.captures?.site, cfg.deploy?.manifest, 'map/judgments',
  ];
  return [...new Set(paths.filter((p) => typeof p === 'string' && p).map((p) => p.replace(/^\.\//, '').replace(/\/+$/, '')))].filter((p) => p && p !== '.');
}
const inDocs = (docs, p) => { const x = String(p).replace(/\/+$/, ''); return docs.some((d) => x === d || x.startsWith(d + '/')); };

// 실행 하나의 최신 여부와 낡은 이유
function freshness(run, fs, cfg, head) {
  if (!run.sha || !head || !fs.hasGit()) return { fresh: false, note: NO_HISTORY };
  const sha = fs.git('rev-parse', '--verify', '--quiet', `${run.sha}^{commit}`);
  if (!sha) return { fresh: false, note: NO_HISTORY };
  if (sha !== head && fs.git('merge-base', sha, head) !== sha) return { fresh: false, note: '결과 커밋이 HEAD의 조상이 아님' };
  const docs = docPaths(cfg);
  if (sha !== head) {
    const n = Number(fs.git('rev-list', '--count', `${sha}..${head}`, '--', '.', ...docs.map((d) => `:(exclude)${d}`)) || 0);
    if (n > 0) return { fresh: false, note: `결과 커밋 뒤 문서 경로 밖 변경 커밋 ${n}` };
  }
  // JUnit 메타처럼 dirtyPaths가 없는 실행은 이 조건을 건너뛴다
  if (Array.isArray(run.dirtyPaths)) {
    const out = run.dirtyPaths.filter((p) => !inDocs(docs, p));
    if (out.length) return { fresh: false, note: `실행 때 문서 경로 밖 변경 ${out.length}(${out.slice(0, 3).join(', ')}${out.length > 3 ? ' …' : ''})` };
  }
  return { fresh: true, note: null };
}

const failedOf = (run) => (run.totals || totalsOf(run.files || [])).failed;
// 개요 신호: 최신 실행 중 실패가 있거나 exit가 0이 아니면 fail, 모두 최신이고 실패 0이면 ok, 최신이 아닌 실행이 있으면 stale, 실행이 없으면 none
export function testSignal(runs) {
  if (!runs.length) return 'none';
  const fresh = runs.filter((r) => r.fresh);
  if (fresh.some((r) => failedOf(r) > 0 || (typeof r.exit === 'number' && r.exit !== 0))) return 'fail';
  return fresh.length === runs.length ? 'ok' : 'stale';
}

export default function testreport(g, fs, cfg) {
  const rel = cfg.tests.report;
  const tests = g.of('test');
  const head = g.get('deploy', 'head')?.props.full || null;
  const unknownAll = (note) => { for (const t of tests) setReading(t, 'lastRun', 'unknown', note); };
  const resRel = resultsPath(cfg);
  let runs;
  let perFile = true;
  if (fs.has(resRel)) {
    try { runs = readResults(fs.abs(resRel)).runs; } catch (e) { unknownAll('결과 JSON을 읽지 못함'); return String(e.message).replace(fs.abs(resRel), resRel); }
    if (!runs.length) { unknownAll('결과 JSON에 실행이 없음'); return '결과 JSON에 실행이 없음'; }
  } else if (rel && fs.has(rel)) {
    const metaFile = rel.replace(/\.xml$/, '.json');
    let meta = {};
    try { meta = fs.has(metaFile) ? JSON.parse(fs.read(metaFile)) : {}; } catch { meta = {}; }
    const parsed = parseJunit(fs.read(rel), fs.ROOT);
    // 메타에는 dirtyPaths가 없다(1.x 메타 모양)
    runs = [{ runner: 'junit', source: rel, sha: meta.sha || null, at: meta.at || parsed.at || null, exit: typeof meta.exit === 'number' ? meta.exit : null, files: parsed.files, totals: parsed.totals }];
    perFile = parsed.files.length > 0;
  } else {
    unknownAll('검사 결과 없음');
    return NO_REPORT;
  }

  const judged = runs.map((run) => ({ ...run, ...freshness(run, fs, cfg, head) }));
  // 파일마다 결과 하나: 최신 실행을 먼저, 같으면 나중 시각
  const byFile = new Map();
  for (const run of judged) {
    for (const f of run.files || []) {
      const cur = byFile.get(f.filePath);
      const better = !cur || (run.fresh && !cur.run.fresh) || (run.fresh === cur.run.fresh && String(run.at || '') > String(cur.run.at || ''));
      if (better) byFile.set(f.filePath, { run, file: f });
    }
  }
  for (const t of tests) {
    const hit = byFile.get(t.id);
    if (!hit) { setReading(t, 'lastRun', 'unknown', perFile ? '결과에 이 검사 파일이 없음' : 'JUnit에 파일(file 속성)이 없어 파일별 결과 없음'); continue; }
    const { run, file } = hit;
    t.props.lastRun = {
      passed: file.failed === 0, tests: file.tests, failed: file.failed, skipped: file.skipped, pending: file.pending,
      ...(file.flaky !== undefined ? { flaky: file.flaky } : {}),
      runner: run.runner, sha: run.sha || null, at: run.at || null, fresh: run.fresh, tags: file.tags || [],
    };
    t.props.runCount = file.tests;
    if (run.fresh) {
      t.props.count = file.tests;
      setReading(t, 'count', 'observed');
      setReading(t, 'lastRun', 'observed');
    } else {
      setReading(t, 'lastRun', 'stale', run.note);
    }
  }

  const totals = judged.reduce((s, r) => { const x = r.totals || totalsOf(r.files || []); s.tests += x.tests; s.failed += x.failed; s.skipped += x.skipped; return s; }, { tests: 0, failed: 0, skipped: 0 });
  const latest = judged.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
  const signal = testSignal(judged);
  g.add('testreport', 'last', '마지막 검사', {
    total: totals.tests, failures: totals.failed, skipped: totals.skipped, sha: latest.sha || null, at: latest.at || null,
    fresh: judged.every((r) => r.fresh), files: [...byFile.keys()].sort(), signal,
    runs: judged.map((r) => ({ runner: r.runner, source: r.source ?? null, sha: r.sha || null, at: r.at || null, exit: r.exit ?? null, fresh: r.fresh })),
  }, { file: fs.has(resRel) ? resRel : rel, line: 1, rule: fs.has(resRel) ? 'testreport:results' : 'testreport:junit' });
  if (totals.tests === 0) return '리포트에 검사가 없음(러너 인자·경로 확인)';
  if (signal === 'fail') {
    const failed = judged.filter((r) => r.fresh).reduce((n, r) => n + failedOf(r), 0);
    return failed ? `실패 ${failed}건` : `실행 종료 코드 ${judged.find((r) => r.fresh && typeof r.exit === 'number' && r.exit !== 0).exit}`;
  }
  return null;
}
