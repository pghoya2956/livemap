// 검사 결과 어댑터: 마지막 검사 실행의 JUnit XML(map/.out/junit.xml)을 읽는다. 기준 커밋이 main HEAD와 같을 때만 "최신 검증"으로 친다.
// 리포트는 `npm run test:report`가 남긴다. 없으면 등급 A를 줄 수 없을 뿐 생성은 계속된다.
export default function testreport(g, fs, cfg) {
  const rel = cfg.tests.report;
  if (!fs.has(rel)) return '검사 리포트 없음(npm run test:report 미실행)';
  const xml = fs.read(rel);
  const suites = [...xml.matchAll(/<testsuite\b([^>]*)>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
  const total = suites.reduce((n, s) => n + Number(s.tests || 0), 0);
  const failures = suites.reduce((n, s) => n + Number(s.failures || 0) + Number(s.errors || 0), 0);
  const skipped = suites.reduce((n, s) => n + Number(s.skipped || 0), 0);
  const metaFile = rel.replace(/\.xml$/, '.json');
  const meta = fs.has(metaFile) ? JSON.parse(fs.read(metaFile)) : {};
  const head = g.get('deploy', 'head')?.props.full || null;
  // suite가 하나도 없는 리포트(러너가 파일을 못 찾은 경우 등)는 통과 근거가 아니다.
  const fresh = total > 0 && !!(meta.sha && head && meta.sha === head);
  g.add('testreport', 'last', '마지막 검사', { total, failures, skipped, sha: meta.sha || null, at: meta.at || null, fresh, files: suites.map((s) => s.name) }, { file: rel, line: 1, rule: 'testreport:junit' });
  // 검사 파일 노드에 통과 여부를 붙인다(파일명 기준 매칭)
  for (const s of suites) {
    const t = g.of('test').find((x) => s.name && (s.name.includes(x.label) || s.name.includes(x.id)));
    if (t) { t.props.lastRun = { passed: Number(s.failures || 0) + Number(s.errors || 0) === 0, tests: Number(s.tests || 0), fresh }; }
  }
  if (total === 0) return '리포트에 검사가 없음(러너 인자·경로 확인)';
  return failures ? `실패 ${failures}건` : null;
}
