// 검증: 생성물 바이트 비교가 아니라 뜻(여정)과 사실(코드)의 정합을 본다.
// error → CI 실패. warn → 화면에 뜨는 경고와 같은 것들.
export function check(d, cfg) {
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });

  for (const a of d.adapters) if (a.status === 'failed') err(`어댑터 실패 ${a.name}: ${a.error}`);
  const counts = { screen: d.summary.routes, api: d.summary.apis, function: d.summary.dbFunctions, test: d.tests.length, task: d.tasks.length, decision: d.decisions.length };
  for (const [k, floor] of Object.entries(cfg.floors || {})) if ((counts[k] ?? 0) < floor) err(`바닥값 미달 ${k}: ${counts[k] ?? 0} < ${floor} (스캐너가 깨졌을 가능성)`);

  const ids = new Set();
  for (const j of d.semantic.journeys) {
    if (ids.has(j.id)) err(`여정 id 중복: ${j.id}`); ids.add(j.id);
    if (!j.steps?.length) err(`여정에 장면 없음: ${j.id}`);
    const stepIds = new Set();
    for (const s of j.steps) {
      if (stepIds.has(s.id)) err(`${j.title}: 장면 id 중복 ${s.id}`); stepIds.add(s.id);
      if (!s.intent && s.status !== 'next') warn(`${j.title} › ${s.label}: intent 비어 있음`);
      for (const w of s.warnings) (/라우트 없음|참조 미해결|장면은 동작인데|관측 근거 없음/.test(w) ? err : warn)(`${j.title} › ${s.label}: ${w}`);
      if (!['live', 'mock', 'planned', 'next'].includes(s.status)) err(`${j.title} › ${s.label}: 알 수 없는 상태 ${s.status}`);
      if (s.status === 'planned' && (s.screens || []).length) warn(`${j.title} › ${s.label}: planned 인데 화면이 있음(mock 이 맞는지 확인)`);
      if (s.capture && !s.captureFile) warn(`${j.title} › ${s.label}: 캡처 파일 없음 ${s.capture}`);
    }
  }
  // 로드맵: 가리키는 장면·작업·선행 항목이 없거나 상태 어휘가 틀리면 오류. 진행 중인데 작업 폴더가 없으면 경고.
  const mids = new Set();
  for (const m of d.roadmap || []) {
    if (mids.has(m.id)) err(`로드맵 id 중복: ${m.id}`); mids.add(m.id);
    for (const p of m.problems) err(`로드맵 ${m.title}: ${p}`);
    if (m.status === '진행' && !m.tasks.length) warn(`로드맵 ${m.title}: 진행인데 작업 폴더가 없음`);
  }
  if (d.orphans.screens.length) warn(`여정에 없는 화면 ${d.orphans.screens.length}: ${d.orphans.screens.join(', ')}`);
  if (d.orphans.apis.length) warn(`어느 화면도 부르지 않는 API ${d.orphans.apis.length}: ${d.orphans.apis.join(', ')}`);
  if (d.orphans.tests.length) warn(`라우트·API에 붙지 않는 검사 ${d.orphans.tests.length}: ${d.orphans.tests.join(', ')}`);
  if (d.deploy && d.deploy.behind === null) warn('배포 sha가 main 이력에 없어 뒤처짐을 계산하지 못함');
  // 어댑터가 g.issue로 낸 문제: 기존 검사 뒤에 그대로 싣는다. error는 종료 코드 1에 센다.
  for (const i of d.issues || []) (i.level === 'error' ? err : warn)(`${i.label}: ${i.message}`);
  return out;
}
