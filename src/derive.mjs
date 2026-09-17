// 파생: 그래프(코드 사실) + 여정 파일(뜻)을 합쳐 화면이 읽는 뷰 모델을 만든다. 화면은 여기서 만든 것만 그린다.
const ROADMAP_STATUS = ['완료', '진행', '다음', '대기', '이후'];
const RANK = { live: 0, partial: 1, mixed: 1, mock: 2, planned: 3, next: 4, static: 5 };
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
// YYYY-MM-DD 이고 달력에 있는 날짜인가
export const isDay = (s) => { const m = String(s ?? '').match(DAY); if (!m) return false; const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3]; };

// 문구 정리: 링크 글자만, 강조·백틱 제거, 공백 정리, n자(코드 포인트) 넘으면 말줄임
export function plain(text, n) {
  const s = String(text ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();
  const cp = [...s];
  return n && cp.length > n ? cp.slice(0, n - 1).join('') + '…' : s;
}
// 결정 대기 "<주체>: <질문>" 나누기. 주체는 콜론 없는 1~20자, 콜론 뒤 공백 필수(URL·시각은 주체가 아니다)
export function splitWaiting(text) {
  const t = plain(text);
  const m = t.match(/^([^:：\s][^:：]{0,19}?)\s*[:：]\s+(.+)$/);
  return m ? { who: m[1].trim(), what: m[2] } : { who: null, what: t };
}

export function derive(g, sem, cfg, { captureExists }) {
  const screens = g.of('screen'), apis = g.of('api'), fns = g.of('function'), tests = g.of('test'), commits = g.of('commit').sort((a, b) => b.props.date.localeCompare(a.props.date));
  const tasks = g.of('task'), decisions = g.of('decision').filter((d) => d.props.kind === 'wiki'), specDefs = g.of('decision').filter((d) => d.props.kind !== 'wiki');
  const head = g.get('deploy', 'head')?.props || null;
  const homelab = g.get('deploy', 'homelab')?.props || null;
  const report = g.get('testreport', 'last')?.props || null;
  const short = (t) => t.split('.').pop();
  const testsOf = (kind, id) => g.in(kind, id, 'covers').map((t) => t.label);
  const testsPassedFresh = (kind, id) => g.in(kind, id, 'covers').some((t) => t.props.lastRun?.passed && t.props.lastRun?.fresh);

  // ---- 화면·API·함수 뷰 ----
  const screenView = screens.map((s) => ({
    path: s.id, component: s.props.component, file: s.props.file, guarded: s.props.guarded, source: s.props.source, mockVia: s.props.mockVia, fixedVia: s.props.fixedVia || [], files: s.props.files,
    apis: g.out('screen', s.id, 'calls').map((a) => a.id), tests: testsOf('screen', s.id), last: s.props.last, src: s.src,
    steps: [],
  }));
  const apiView = apis.map((a) => ({ path: a.id, method: a.props.method || '?', calls: a.props.calls || [], tests: testsOf('api', a.id), src: a.src, declared: !!a.src }));
  const fnView = fns.map((f) => ({ name: f.id, usedByApi: g.in('function', f.id, 'invokes').length > 0, tables: g.out('function', f.id, 'touches').map((t) => t.label), tests: testsOf('function', f.id), migration: f.props.migration || null, src: f.src }));
  const migView = g.of('migration').map((m) => ({ file: m.id, tables: m.props.tables.map(short), functions: m.props.functions.map(short), grants: m.props.grants, rls: m.props.rls, last: m.props.last }));
  const testView = tests.map((t) => ({ file: t.id, label: t.label, kind: t.props.kind, count: t.props.count, gated: t.props.gated, lastRun: t.props.lastRun || null }));

  // ---- 여정 해석 ----
  const byPath = Object.fromEntries(screenView.map((s) => [s.path, s]));
  const apiByPath = Object.fromEntries(apiView.map((a) => [a.path, a]));
  const decisionBySlug = Object.fromEntries(decisions.map((d) => [d.id, d]));
  const defBy = Object.fromEntries(specDefs.map((d) => [d.id, { task: g.in('decision', d.id, 'defines')[0]?.id || null, file: d.props.file, done: d.props.done }]));
  const resolveRef = (ref) => { const m = ref.match(/^((?:DEC|PN|P\d)-\d+)/i); return m ? defBy[m[1].toUpperCase()] || null : null; };
  const journeys = (sem.journeys || []).map((j) => {
    const steps = j.steps.map((st) => {
      const actor = st.actor || j.actor;
      const screenNodes = (st.screens || []).map((p) => byPath[p] ? { path: p, source: byPath[p].source, file: byPath[p].file, tests: byPath[p].tests, last: byPath[p].last, mockVia: byPath[p].mockVia, fixedVia: byPath[p].fixedVia } : { path: p, source: 'missing' });
      const apiSet = new Set(st.apis || []);
      for (const p of st.screens || []) for (const a of byPath[p]?.apis || []) apiSet.add(a);
      const apiNodes = [...apiSet].map((p) => apiByPath[p] ? { path: p, method: apiByPath[p].method, calls: apiByPath[p].calls, tests: apiByPath[p].tests } : { path: p, method: '?', calls: [], tests: [], missing: true });
      const fnNames = [...new Set(apiNodes.flatMap((a) => a.calls.filter((c) => !c.startsWith('auth:'))))];
      const functionNodes = fnNames.map((n) => ({ name: n, tables: fnView.find((f) => f.name === n)?.tables || [], tests: testsOf('function', n) }));
      const testFiles = [...new Set([...screenNodes.flatMap((x) => x.tests || []), ...apiNodes.flatMap((x) => x.tests || []), ...functionNodes.flatMap((x) => x.tests || [])])];
      const refNodes = (st.refs || []).map((r) => ({ ref: r, ...(resolveRef(r) || {}), wiki: decisionBySlug[r] ? { title: decisionBySlug[r].label, file: decisionBySlug[r].props.file, status: decisionBySlug[r].props.status } : null }));
      const taskNames = [...new Set(refNodes.map((r) => r.task).filter(Boolean))];
      const warnings = [];
      for (const n of screenNodes) {
        if (n.source === 'missing') warnings.push(`라우트 없음: ${n.path}`);
        else if (st.status === 'live' && n.source !== 'live') warnings.push(`장면은 동작인데 화면은 ${n.source}: ${n.path}`);
        else if ((st.status === 'planned' || st.status === 'next') && n.source === 'live') warnings.push(`장면은 ${st.status}인데 화면은 동작: ${n.path}`);
      }
      for (const r of refNodes) if (/^(DEC|PN|P\d)-/i.test(r.ref) && !r.task) warnings.push(`참조 미해결: ${r.ref}`);
      // 등급: D 주장 / C 관측 / B 검사 존재 / A 최신 커밋에서 통과
      const observed = screenNodes.length > 0 && screenNodes.every((n) => n.source === 'live');
      const covered = observed && testFiles.length > 0;
      const verified = covered && (screenNodes.some((n) => testsPassedFresh('screen', n.path)) || apiNodes.some((a) => !a.missing && testsPassedFresh('api', a.path)) || functionNodes.some((f) => testsPassedFresh('function', f.name)));
      const grade = st.status !== 'live' ? null : verified ? 'A' : covered ? 'B' : observed ? 'C' : 'D';
      if (grade === 'D') warnings.push('동작 주장에 관측 근거 없음');
      // 신선도: 장면 확인일보다 화면 파일이 나중에 바뀌었으면 확인 필요
      const changedAfter = st.reviewedAt ? screenNodes.filter((n) => n.last && n.last.date > st.reviewedAt).map((n) => n.path) : [];
      if (changedAfter.length) warnings.push(`확인 필요: ${st.reviewedAt} 뒤 화면 변경 ${changedAfter.join(', ')}`);
      const recentCommits = [...new Map(screenNodes.flatMap((n) => g.in('screen', n.path, 'changes')).map((c) => [c.id, c])).values()].sort((a, b) => b.props.date.localeCompare(a.props.date)).slice(0, 5).map((c) => ({ sha: c.id, date: c.props.date, subject: c.label }));
      const captureFile = captureExists(st.capture);
      for (const n of screenNodes) if (byPath[n.path]) byPath[n.path].steps.push({ journey: j.id, step: st.id, label: `${j.title} › ${st.label}` });
      return { ...st, actor, screenNodes, apiNodes, functionNodes, testFiles, refNodes, taskNames, warnings, grade, captureFile, recentCommits };
    });
    const sts = steps.map((s) => s.status);
    const status = sts.every((s) => s === 'live') ? 'live' : sts.some((s) => s === 'live') ? 'partial' : sts.slice().sort((a, b) => RANK[a] - RANK[b])[0];
    const counts = Object.fromEntries(['live', 'mock', 'planned', 'next'].map((k) => [k, sts.filter((s) => s === k).length]));
    return { ...j, steps, status, counts, taskNames: [...new Set(steps.flatMap((s) => s.taskNames))], warnings: steps.reduce((n, s) => n + s.warnings.length, 0) };
  });

  // ---- 고아·커버리지 ----
  const inJourney = new Set(journeys.flatMap((j) => j.steps.flatMap((s) => s.screens || [])));
  const calledApis = new Set(screenView.flatMap((s) => s.apis).concat(journeys.flatMap((j) => j.steps.flatMap((s) => s.apis || []))));
  const orphans = {
    screens: screenView.filter((s) => !inJourney.has(s.path)).map((s) => s.path),
    apis: apiView.filter((a) => !calledApis.has(a.path)).map((a) => a.path),
    functions: fnView.filter((f) => !f.usedByApi).map((f) => f.name),
    tests: testView.filter((t) => !g.out('test', t.file, 'covers').length).map((t) => t.label),
  };
  const coverage = { screens: { inJourney: screenView.length - orphans.screens.length, total: screenView.length } };

  // ---- 커밋 영향 ----
  const commitView = commits.map((c) => {
    const routes = g.out('commit', c.id, 'changes').filter((n) => n.kind === 'screen').map((n) => n.id);
    const js = [...new Map(routes.flatMap((p) => byPath[p]?.steps || []).map((x) => [x.journey + '/' + x.step, x])).values()];
    return { sha: c.id, date: c.props.date, author: c.props.author, subject: c.label, files: c.props.files, areas: c.props.areas, runtime: c.props.runtime, routes, journeys: js, touchesApi: g.out('commit', c.id, 'changes').some((n) => n.kind === 'api'), touchesDb: g.out('commit', c.id, 'changes').some((n) => n.kind === 'migration') };
  });
  const areaCounts = {};
  for (const c of commitView) for (const a of c.areas) areaCounts[a] = (areaCounts[a] || 0) + 1;

  // ---- 작업·장부·결정 ----
  const taskView = tasks.map((t) => ({ name: t.id, title: t.label, ...t.props, journeys: journeys.filter((j) => j.taskNames.includes(t.id)).map((j) => ({ id: j.id, title: j.title, status: j.status, steps: j.steps.filter((s) => s.taskNames.includes(t.id)).map((s) => s.label) })) })).sort((a, b) => b.name.localeCompare(a.name));
  const ledger = { running: g.of('ledger').filter((l) => l.props.state === 'running').map((l) => ({ work: l.label, owner: l.props.owner, done: l.props.done })), waiting: g.of('ledger').filter((l) => l.props.state !== 'running').map((l) => ({ work: l.label, state: l.props.status, resume: l.props.resume, done: l.props.state === 'done' })) };
  const decisionView = decisions.map((d) => ({ slug: d.id, title: d.label, file: d.props.file, status: d.props.status, summary: d.props.summary, refs: journeys.reduce((n, j) => n + j.steps.filter((s) => s.refNodes.some((r) => r.wiki && r.wiki.file === d.props.file)).length, 0) }));
  // ---- 로드맵: 항목 순서대로 장면 상태·작업 단계를 붙인다. 해석 실패는 check가 오류로 막는다 ----
  const stepByRef = Object.fromEntries(journeys.flatMap((j) => j.steps.map((s) => [`${j.id}/${s.id}`, { journey: j.id, step: s.id, label: `${j.title} › ${s.label}`, status: s.status, grade: s.grade, fixed: s.screenNodes.some((n) => (n.fixedVia || []).length) }])));
  const milestones = g.of('milestone').sort((a, b) => a.props.order - b.props.order);
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const releases = g.of('release').sort((a, b) => a.props.order - b.props.order);
  const releaseIds = new Set(releases.map((r) => r.id));
  const roadmap = milestones.map((m) => {
    const p = m.props;
    const scenes = p.scenes.map((r) => stepByRef[r] ? { ref: r, ...stepByRef[r] } : { ref: r, missing: true });
    const trackedTasks = p.tasks.map((name) => { const t = taskView.find((x) => x.name === name); return t ? { name, title: t.title, stage: t.stage, status: t.status, pnDone: t.pnDone, pnOpen: t.pnOpen } : { name, missing: true }; });
    const problems = [...scenes.filter((s) => s.missing).map((s) => `장면 없음: ${s.ref}`), ...trackedTasks.filter((t) => t.missing).map((t) => `작업 폴더 없음: ${t.name}`), ...p.deps.filter((d) => !milestoneIds.has(d)).map((d) => `선행 항목 없음: ${d}`)];
    if (!ROADMAP_STATUS.includes(p.status)) problems.push(`알 수 없는 상태: ${p.status || '(비어 있음)'}`);
    if (p.milestone && !releaseIds.has(p.milestone)) problems.push(`마일스톤 없음 ${p.milestone}`);
    const live = scenes.filter((s) => s.status === 'live').length;
    const deps = p.deps.map((d) => ({ id: d, title: milestones.find((x) => x.id === d)?.label || d, status: milestones.find((x) => x.id === d)?.props.status || null }));
    const waiting = splitWaiting(p.waitingOn);
    // 막힘: 결정 대기(비완료), 선행 미완(진행·다음), 추적 작업 대기
    const blockedBy = [];
    if (p.status !== '완료' && p.waitingOn) blockedBy.push('waiting');
    if (['진행', '다음'].includes(p.status) && deps.some((d) => d.status !== '완료')) blockedBy.push('deps');
    if (trackedTasks.some((t) => t.status === '대기')) blockedBy.push('task');
    return { id: m.id, order: p.order, title: m.label, status: p.status, mode: p.mode, goal: p.goal, waitingOn: p.waitingOn, done: p.done, deps, scenes, tasks: trackedTasks, progress: { live, total: scenes.length, fixed: scenes.filter((s) => s.fixed).length }, problems, src: m.src,
      milestone: p.milestone ?? null, completedAt: p.completedAt ?? null, waitingSince: p.waitingSince ?? null, waitingWho: waiting.who, waitingWhat: waiting.what, blockedBy };
  });
  for (const t of taskView) t.roadmapItems = roadmap.filter((m) => m.tasks.some((x) => x.name === t.name)).map((m) => m.id);

  // ---- 마일스톤(release 노드): 소속 항목·진척·막힘. problems·warnings는 check가 그대로 싣는 완성 문장이다 ----
  const itemIds = new Set(roadmap.map((m) => m.id));
  const milestoneView = releases.map((r) => {
    const p = r.props;
    const items = roadmap.filter((m) => m.milestone === r.id);
    const sceneRefs = new Map(items.flatMap((m) => m.scenes.filter((s) => !s.missing)).map((s) => [s.ref, s]));
    const planTasks = new Map(items.flatMap((m) => m.tasks.filter((t) => !t.missing)).map((t) => [t.name, t]));
    const waiting = splitWaiting(p.waitingOn);
    const at = `마일스톤 ${r.label}: `;
    const problems = [], warnings = [];
    if (p.idMissing) problems.push(`${at}id 없음`);
    if (p.duplicates || itemIds.has(r.id)) problems.push(`마일스톤 id 중복: ${r.id}`);
    if (!ROADMAP_STATUS.includes(p.status)) problems.push(`${at}알 수 없는 상태 ${p.status || '(비어 있음)'}`);
    for (const [key, v] of [['완료일', p.completedOn], ['목표일', p.targetOn]]) if (v && !isDay(v)) problems.push(`${at}날짜 형식 ${key} ${v}`);
    const open = items.filter((m) => m.status !== '완료');
    if (p.status === '완료' && open.length) warnings.push(`${at}완료인데 미완료 항목 ${open.length}`);
    if (p.status !== '완료' && items.length && !open.length) warnings.push(`${at}항목이 모두 완료인데 상태 ${p.status}`);
    if (['다음', '대기', '이후'].includes(p.status) && items.some((m) => m.status === '진행')) warnings.push(`${at}진행 항목이 있는데 상태 ${p.status}`);
    if (!items.length) warnings.push(`${at}묶인 항목 없음`);
    if ((p.status === '완료') !== !!p.completedOn) warnings.push(`${at}완료일과 상태가 맞지 않음`);
    return {
      id: r.id, order: p.order, title: r.label, status: p.status, goal: p.goal, completedOn: p.completedOn || null, targetOn: p.targetOn || null,
      waitingOn: p.waitingOn, waitingWho: waiting.who, waitingWhat: waiting.what, waitingSince: p.waitingSince ?? null,
      items: items.map((m) => m.id), progress: { live: [...sceneRefs.values()].filter((s) => s.status === 'live').length, total: sceneRefs.size },
      plans: { done: [...planTasks.values()].reduce((n, t) => n + (t.pnDone || 0), 0), total: [...planTasks.values()].reduce((n, t) => n + (t.pnDone || 0) + (t.pnOpen || 0), 0) },
      blocked: !!p.waitingOn || open.some((m) => m.blockedBy.length > 0), problems, warnings, src: r.src,
    };
  });

  const plans = taskView.filter((t) => t.pnDone + t.pnOpen > 0).map((t) => ({ task: t.name, title: t.title, done: t.pnDone, open: t.pnOpen, oq: t.oq }));

  const summary = {
    routes: screenView.length, liveRoutes: screenView.filter((s) => s.source === 'live').length, mockRoutes: screenView.filter((s) => s.source === 'mock' || s.source === 'mixed').length, fixedRoutes: screenView.filter((s) => s.fixedVia.length).length,
    apis: apiView.length, dbFunctions: fnView.length, dbTables: g.of('table').length, tests: testView.reduce((n, t) => n + t.count, 0), e2e: testView.filter((t) => t.kind === 'e2e').reduce((n, t) => n + t.count, 0),
    pnDone: plans.reduce((n, p) => n + p.done, 0), pnOpen: plans.reduce((n, p) => n + p.open, 0), oq: plans.reduce((n, p) => n + p.oq, 0),
    commits: commitView.length, warnings: journeys.reduce((n, j) => n + j.warnings, 0), orphans: Object.values(orphans).reduce((n, a) => n + a.length, 0),
    stepsLive: journeys.reduce((n, j) => n + j.counts.live, 0), stepsTotal: journeys.reduce((n, j) => n + j.steps.length, 0),
    grades: Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, journeys.reduce((n, j) => n + j.steps.filter((s) => s.grade === k).length, 0)])),
  };

  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), project: sem.project || cfg.project, head, deploy: homelab, testreport: report,
    adapters: g.toJSON().adapters, semantic: { actors: sem.actors || {}, statusLegend: sem.statusLegend || {}, journeys },
    summary, orphans, coverage, tasks: taskView, roadmap, ledger, decisions: decisionView, plans, commits: commitView, areaCounts,
    screens: screenView, apis: apiView, functions: fnView, migrations: migView, tests: testView,
    milestones: milestoneView, issues: g.issues.map((i) => ({ ...i })), sources: { semantic: cfg.semantic, roadmap: cfg.roadmap?.file ?? null },
  };
}

// 첫 화면 전용 조각: 시스템 식별자(경로·파일·sha)를 뺀다. 개요는 이것만 받는다.
export function overviewSlice(d) {
  const A = d.semantic.actors;
  const lastRun = d.testreport ? { fresh: d.testreport.fresh, failures: d.testreport.failures, total: d.testreport.total, at: d.testreport.at } : null;
  return {
    generatedAt: d.generatedAt, project: d.project, headDate: d.head?.date || null,
    line: summaryLine(d),
    journeys: d.semantic.journeys.map((j) => ({ id: j.id, title: j.title, actor: A[j.actor] || j.actor, lane: j.lane, status: j.status, warnings: j.warnings, steps: j.steps.map((s) => ({ id: s.id, label: s.label, status: s.status, grade: s.grade, warn: s.warnings.length > 0 })) })),
    running: d.ledger.running.map((r) => ({ work: r.work, owner: r.owner })),
    roadmap: d.roadmap.filter((m) => m.status !== '완료').slice(0, 4).map((m) => ({ id: m.id, title: m.title, status: m.status, mode: m.mode, live: m.progress.live, total: m.progress.total, waiting: !!m.waitingOn })),
    roadmapDone: d.roadmap.filter((m) => m.status === '완료').length, roadmapTotal: d.roadmap.length,
    waiting: d.ledger.waiting.filter((w) => !w.done).map((w) => ({ work: w.work, state: (w.state || '').split('(')[0] })),
    tasks: d.tasks.filter((t) => t.status !== '폐기' && t.status !== '기록').slice().sort((a, b) => (a.status === '진행' ? -1 : 1) - (b.status === '진행' ? -1 : 1) || b.recentCommits - a.recentCommits).slice(0, 6).map((t) => ({ id: t.name, title: t.title, stage: t.stage, status: t.status, pnDone: t.pnDone, pnOpen: t.pnOpen, oq: t.oq })),
    signals: {
      deploy: d.deploy ? (d.deploy.behindRuntime === 0 ? 'ok' : d.deploy.behindRuntime === null ? 'unknown' : 'behind') : 'unknown', deployBehind: d.deploy?.behindRuntime ?? null,
      tests: lastRun ? (lastRun.failures ? 'fail' : lastRun.fresh ? 'ok' : 'stale') : 'none', lastRun,
      adapters: d.adapters.some((a) => a.status === 'failed') ? 'fail' : d.adapters.some((a) => a.status === 'partial') ? 'partial' : 'ok', adapterNotes: d.adapters.filter((a) => a.status !== 'ok').map((a) => `${a.name}: ${a.error}`),
      warnings: d.summary.warnings, orphans: d.summary.orphans, gated: d.tests.filter((t) => t.gated).reduce((n, t) => n + t.count, 0),
    },
    counts: { stepsLive: d.summary.stepsLive, stepsTotal: d.summary.stepsTotal, screensLive: d.summary.liveRoutes, screensFixed: d.summary.fixedRoutes, screens: d.summary.routes, apis: d.summary.apis, functions: d.summary.dbFunctions, tests: d.summary.tests, pnDone: d.summary.pnDone, pnTotal: d.summary.pnDone + d.summary.pnOpen, oq: d.summary.oq, decisions: d.decisions.filter((x) => x.status === 'current').length, proposed: d.decisions.filter((x) => x.status === 'proposed').length, grades: d.summary.grades },
    areas: Object.entries(d.areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
    recent: d.commits.filter((c) => c.journeys.length).slice(0, 6).map((c) => ({ date: c.date, subject: c.subject, scenes: c.journeys.map((x) => x.label) })),
    openQuestions: d.plans.filter((p) => p.oq).map((p) => ({ title: p.title, oq: p.oq })),
  };
}

export function summaryLine(d) {
  const s = d.summary;
  const next = (d.roadmap || []).find((m) => m.status === '진행')?.title || (d.roadmap || []).find((m) => m.status === '다음')?.title || d.ledger.running[0]?.work || d.ledger.waiting.find((w) => !w.done && /대기/.test(w.state || ''))?.work || '';
  const parts = [`장면 ${s.stepsLive}/${s.stepsTotal} 동작`, `화면 ${s.liveRoutes}/${s.routes} 실데이터`, ...(s.fixedRoutes ? [`하드코딩 표시 ${s.fixedRoutes}`] : []), `14일 커밋 ${s.commits}`];
  if (d.deploy && d.deploy.behindRuntime > 0) parts.push(`미배포 ${d.deploy.behindRuntime}`);
  if (s.warnings) parts.push(`경고 ${s.warnings}`);
  return `${parts.join(' · ')}${next ? ` · 다음: ${next.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 40)}` : ''}`;
}
