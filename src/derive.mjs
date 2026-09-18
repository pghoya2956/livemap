// 파생: 그래프(코드 사실) + 여정 파일(뜻)을 합쳐 화면이 읽는 뷰 모델을 만든다. 화면은 여기서 만든 것만 그린다.
import { combineReading, countReadings, readingOf } from './lib/reading.mjs';
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
// 변경 종류: 커밋 제목의 관례 접두어(`feat(범위)!:`)만 본다. 프로젝트의 영역 이름을 가정하지 않는다
const KINDS = { feat: '기능', fix: '수정', docs: '문서', test: '검사', refactor: '정리', perf: '정리', style: '정리', build: '운영', ci: '운영', chore: '운영', deploy: '운영', release: '운영' };
const PREFIX = /^([a-z]+)(\([^)]*\))?!?:\s*/i;
export function changeKind(subject) {
  const m = String(subject ?? '').match(PREFIX);
  return (m && KINDS[m[1].toLowerCase()]) || '변경';
}
// 커밋 제목 정리: 접두어·[skip ci]·내부 ID·식별자 낱말을 지우고 괄호·끝 기호를 정리한다. 2자 미만이면 "{종류} 변경"
export function subjectPlain(subject, n) {
  const kind = changeKind(subject);
  let s = plain(String(subject ?? '').replace(PREFIX, '').replace(/\[(skip ci|ci skip)\]/gi, ''));
  s = s.replace(/\b(PN|DEC|OQ|AC|P\d)-\d+(?:\s*[·,~]\s*\d+)*/g, '').replace(/\b(PN|DEC|OQ|AC)\b/g, '').replace(/\bQ\d+\b/g, '');
  s = s.split(' ').filter((w) => !/^[0-9a-f]{7,40}$/i.test(w) && !w.includes('/api/') && !/\.(tsx|mjs|sql)$/.test(w) && !w.startsWith('web/src')).join(' ');
  s = s.replace(/\(\s*[,·\s]*/g, '(').replace(/[,·\s]*\)/g, ')').replace(/\(\)/g, '').replace(/\s+/g, ' ').replace(/[\s\-–—:·,]+$/, '').trim();
  if ([...s].length < 2) s = `${kind} 변경`;
  return plain(s, n);
}
// Asia/Seoul 날짜(YYYY-MM-DD). 커밋 시각의 Z·+09:00 혼용을 Date로 통일한다
const seoulDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const STEP_STATUS = ['live', 'mock', 'planned', 'next'];
// 결정 대기 "<주체>: <질문>" 나누기. 주체는 콜론 없는 1~20자, 콜론 뒤 공백 필수(URL·시각은 주체가 아니다)
export function splitWaiting(text) {
  const t = plain(text);
  const m = t.match(/^([^:：\s][^:：]{0,19}?)\s*[:：]\s+(.+)$/);
  return m ? { who: m[1].trim(), what: m[2] } : { who: null, what: t };
}

// 로드맵 선행의 흐름 문제(1.3.0): 선행 순환과 마일스톤 순서 역행. 화면 ui/lib/tree.js와 같은 규칙이고 check는 경고로 낸다.
// 순환: 자기에게 되돌아오는 항목마다 자기에서 시작해 선행 → 후속 방향으로 돌아오는 가장 짧은 경로 한 문장.
// 역행: 마일스톤이 있을 때 선행의 열(파일 순서, 미배정·없는 id는 맨 오른쪽)이 항목의 열보다 오른쪽이면 엣지마다 한 문장.
function roadmapFlowProblems(items, releases) {
  const out = new Map();
  const add = (id, text) => { if (!out.has(id)) out.set(id, []); out.get(id).push(text); };
  const ids = new Set(items.map((m) => m.id));
  const deps = new Map(items.map((m) => [m.id, [...new Set(m.props.deps)].filter((d) => ids.has(d))]));
  const children = new Map(items.map((m) => [m.id, []]));
  for (const m of items) for (const d of deps.get(m.id)) children.get(d).push(m.id);
  for (const m of items) {
    const prev = new Map([[m.id, null]]);
    const queue = [m.id];
    let back = null;
    for (let i = 0; i < queue.length && !back; i++) {
      for (const c of children.get(queue[i])) {
        if (c === m.id) { back = queue[i]; break; }
        if (!prev.has(c)) { prev.set(c, queue[i]); queue.push(c); }
      }
    }
    if (!back) continue;
    const path = [m.id];
    for (let x = back; x !== m.id; x = prev.get(x)) path.splice(1, 0, x);
    add(m.id, `선행 순환: ${[...path, m.id].join(' → ')}`);
  }
  if (releases.length) {
    const col = new Map(releases.map((r, i) => [r.id, i]));
    const colOf = (m) => col.get(m.props.milestone) ?? releases.length;
    const label = (m) => (col.has(m.props.milestone) ? m.props.milestone : '마일스톤 없음');
    const byId = new Map(items.map((m) => [m.id, m]));
    for (const m of items) for (const d of deps.get(m.id)) {
      const p = byId.get(d);
      if (colOf(p) > colOf(m)) add(m.id, `마일스톤 순서 역행: ${d}(${label(p)}) → ${m.id}(${label(m)})`);
    }
  }
  return out;
}

export function derive(g, sem, cfg, { captureExists }) {
  const screens = g.of('screen'), apis = g.of('api'), fns = g.of('function'), tests = g.of('test'), commits = g.of('commit').sort((a, b) => b.props.date.localeCompare(a.props.date));
  const tasks = g.of('task'), decisions = g.of('decision').filter((d) => d.props.kind === 'wiki'), specDefs = g.of('decision').filter((d) => d.props.kind !== 'wiki');
  const head = g.get('deploy', 'head')?.props || null;
  const homelab = g.get('deploy', 'homelab')?.props || null;
  const report = g.get('testreport', 'last')?.props || null;
  const short = (t) => t.split('.').pop();
  const testsOf = (kind, id) => g.in(kind, id, 'covers').map((t) => t.label);
  // 등급 A: 덮는 검사 파일 중 하나가 최신 실행에서 검사 1개 이상·실패 0(파일 경로 정확 일치는 testreport 어댑터가 맞춘다)
  const testsPassedFresh = (kind, id) => g.in(kind, id, 'covers').some((t) => t.props.lastRun?.passed && t.props.lastRun?.fresh && (t.props.lastRun.tests ?? 1) >= 1);

  // ---- 화면·API·함수 뷰 ----
  const screenView = screens.map((s) => ({
    path: s.id, component: s.props.component, file: s.props.file, guarded: s.props.guarded, source: s.props.source, mockVia: s.props.mockVia, fixedVia: s.props.fixedVia || [], files: s.props.files,
    apis: g.out('screen', s.id, 'calls').map((a) => a.id), tests: testsOf('screen', s.id), last: s.props.last, src: s.src,
    steps: [], reading: s.props.reading || {},
  }));
  const apiView = apis.map((a) => ({ path: a.id, method: a.props.method || '?', calls: a.props.calls || [], tests: testsOf('api', a.id), src: a.src, declared: !!a.src }));
  const fnView = fns.map((f) => ({ name: f.id, usedByApi: g.in('function', f.id, 'invokes').length > 0, tables: g.out('function', f.id, 'touches').map((t) => t.label), tests: testsOf('function', f.id), migration: f.props.migration || null, src: f.src }));
  const migView = g.of('migration').map((m) => ({ file: m.id, tables: m.props.tables.map(short), functions: m.props.functions.map(short), grants: m.props.grants, rls: m.props.rls, last: m.props.last }));
  const testView = tests.map((t) => ({ file: t.id, label: t.label, kind: t.props.kind, count: t.props.count, gated: t.props.gated, lastRun: t.props.lastRun || null, reading: t.props.reading || {}, readingNotes: t.props.readingNotes || {} }));

  // ---- 여정 해석 ----
  const byPath = Object.fromEntries(screenView.map((s) => [s.path, s]));
  const apiByPath = Object.fromEntries(apiView.map((a) => [a.path, a]));
  const decisionBySlug = Object.fromEntries(decisions.map((d) => [d.id, d]));
  // 번호 참조: 정의 작업(definers)이 하나면 그 작업(rule), 여럿이면 폴더 이름 순 첫 작업(partial, tasks.ambiguous-ref).
  // 정의 작업이 없는 노드(1.1.1 호환 줄에서만 만든 노드)는 1.1.1처럼 노드를 만든 작업으로 잇는다. <폴더>#<번호>는 그 작업의 정의만 본다
  const defNode = Object.fromEntries(specDefs.map((d) => [d.id, d]));
  const defOf = (d, task) => ({ task, file: d.props.file, done: d.props.done });
  const resolveRef = (ref) => {
    const q = ref.match(/^(\d{8}-[^\s#]+)#([A-Za-z]{1,4}[0-9]?-\d+)/);
    if (q) {
      const d = defNode[q[2].toUpperCase()];
      const at = d && ((d.props.definedAt || []).find((x) => x.task === q[1]) || (g.in('decision', d.id, 'defines').some((t) => t.id === q[1]) ? { task: q[1], file: d.props.file } : null));
      return at ? { task: at.task, file: at.file, done: d.props.done, definers: d.props.definers || [], reading: 'rule' } : { qualified: true };
    }
    const m = ref.match(/^((?:DEC|PN|P\d)-\d+)/i) || ref.match(/^([A-Z]{1,4}[0-9]?-\d+)/);
    if (!m) return null;
    const d = defNode[m[1].toUpperCase()];
    if (!d) return { id: m[1].toUpperCase() };
    const definers = d.props.definers || [];
    if (definers.length > 1) return { ...defOf(d, definers[0]), definers, reading: 'partial', ambiguous: m[1].toUpperCase() };
    if (definers.length === 1) return { ...defOf(d, definers[0]), definers, reading: 'rule' };
    const task = g.in('decision', d.id, 'defines')[0]?.id || null;
    return task ? { ...defOf(d, task), definers, reading: 'rule' } : { id: d.id };
  };
  const seenIssue = new Set(g.issues.map((i) => `${i.code}|${i.subject?.id}|${i.message}`));
  // 관측한 화면 호출(calls 엣지). 고아 API와 journey.api-not-observed는 이것만 센다
  const observedApis = new Set(screenView.flatMap((s) => s.apis));
  const journeys = (sem.journeys || []).map((j) => {
    const steps = j.steps.map((st) => {
      const actor = st.actor || j.actor;
      const screenNodes = (st.screens || []).map((p) => byPath[p] ? { path: p, source: byPath[p].source, file: byPath[p].file, tests: byPath[p].tests, last: byPath[p].last, mockVia: byPath[p].mockVia, fixedVia: byPath[p].fixedVia } : { path: p, source: 'missing' });
      const apiSet = new Set(st.apis || []);
      for (const a of st.apis || []) {
        if (observedApis.has(a)) continue;
        const message = `${j.title} › ${st.label}: 여정 apis ${a}를 부르는 화면이 관측되지 않음`;
        const subject = { kind: 'step', id: `${j.id}/${st.id}` };
        const key = `journey.api-not-observed|${subject.id}|${message}`;
        if (seenIssue.has(key)) continue;
        seenIssue.add(key);
        g.issue('warn', '여정 API', message, { code: 'journey.api-not-observed', subject, anchors: cfg.semantic ? [{ file: cfg.semantic }] : [] });
      }
      for (const p of st.screens || []) for (const a of byPath[p]?.apis || []) apiSet.add(a);
      const apiNodes = [...apiSet].map((p) => apiByPath[p] ? { path: p, method: apiByPath[p].method, calls: apiByPath[p].calls, tests: apiByPath[p].tests } : { path: p, method: '?', calls: [], tests: [], missing: true });
      const fnNames = [...new Set(apiNodes.flatMap((a) => a.calls.filter((c) => !c.startsWith('auth:'))))];
      const functionNodes = fnNames.map((n) => ({ name: n, tables: fnView.find((f) => f.name === n)?.tables || [], tests: testsOf('function', n) }));
      const testFiles = [...new Set([...screenNodes.flatMap((x) => x.tests || []), ...apiNodes.flatMap((x) => x.tests || []), ...functionNodes.flatMap((x) => x.tests || [])])];
      const refNodes = (st.refs || []).map((r) => { const { qualified, id, ambiguous, ...hit } = resolveRef(r) || {}; return { ref: r, ...hit, wiki: decisionBySlug[r] ? { title: decisionBySlug[r].label, file: decisionBySlug[r].props.file, status: decisionBySlug[r].props.status } : null, _q: qualified, _id: id, _amb: ambiguous }; });
      const taskNames = [...new Set(refNodes.map((r) => r.task).filter(Boolean))];
      const warnings = [];
      for (const n of screenNodes) {
        if (n.source === 'missing') warnings.push(`라우트 없음: ${n.path}`);
        else if (st.status === 'live' && n.source !== 'live') warnings.push(`장면은 동작인데 화면은 ${n.source}: ${n.path}`);
        else if ((st.status === 'planned' || st.status === 'next') && n.source === 'live') warnings.push(`장면은 ${st.status}인데 화면은 동작: ${n.path}`);
      }
      for (const r of refNodes) {
        if ((/^(DEC|PN|P\d)-/i.test(r.ref) || r._q) && !r.task) warnings.push(`참조 미해결: ${r.ref}`);
        // 1.1.1이 인식하지 않던 접두어는 풀리지 않아도 경고(1.x 종료 코드 보호)
        else if (r._id && !r.task) warnings.push(`번호 참조 대상 없음: ${r.ref}`);
        if (r._amb) {
          const d = defNode[r._amb];
          const message = `${j.title} › ${st.label}: ${r._amb}을 정의한 작업 ${r.definers.length}개, 폴더 이름 순 첫 작업 ${r.task}로 이음`;
          const subject = { kind: 'step', id: `${j.id}/${st.id}` };
          const key = `tasks.ambiguous-ref|${subject.id}|${message}`;
          if (!seenIssue.has(key)) {
            seenIssue.add(key);
            g.issue('warn', '여정 참조', message, { code: 'tasks.ambiguous-ref', subject, anchors: (d.props.definedAt || []).map((x) => ({ file: x.file, line: x.line })) });
          }
        }
        delete r._q; delete r._id; delete r._amb;
      }
      // 등급: D 주장 / C 관측 / B 검사 존재 / A 최신 커밋에서 통과
      // 관측 근거: 화면이 있으면 그 화면이 모두 실데이터일 때. 화면 없이 API로만 도는 단계(알림 발송 등)는
      // 선언한 API가 모두 코드에 있을 때 관측으로 본다. 화면도 API도 없으면 주장(D)이다.
      const observed = screenNodes.length > 0
        ? screenNodes.every((n) => n.source === 'live')
        : apiNodes.length > 0 && apiNodes.every((a) => !a.missing);
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
  const orphans = {
    screens: screenView.filter((s) => !inJourney.has(s.path)).map((s) => s.path),
    apis: apiView.filter((a) => !observedApis.has(a.path)).map((a) => a.path),
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
  const taskView = tasks.map((t) => ({ name: t.id, title: t.label, ...t.props, readLines: undefined, reading: t.props.reading || {}, readingNotes: t.props.readingNotes || {}, journeys: journeys.filter((j) => j.taskNames.includes(t.id)).map((j) => ({ id: j.id, title: j.title, status: j.status, steps: j.steps.filter((s) => s.taskNames.includes(t.id)).map((s) => s.label) })) })).sort((a, b) => b.name.localeCompare(a.name));
  const ledger = { running: g.of('ledger').filter((l) => l.props.state === 'running').map((l) => ({ work: l.label, owner: l.props.owner, done: l.props.done })), waiting: g.of('ledger').filter((l) => l.props.state !== 'running').map((l) => ({ work: l.label, state: l.props.status, resume: l.props.resume, done: l.props.state === 'done' })) };
  const decisionView = decisions.map((d) => ({ slug: d.id, title: d.label, file: d.props.file, status: d.props.status, summary: d.props.summary, refs: journeys.reduce((n, j) => n + j.steps.filter((s) => s.refNodes.some((r) => r.wiki && r.wiki.file === d.props.file)).length, 0) }));
  // ---- 로드맵: 항목 순서대로 장면 상태·작업 단계를 붙인다. 해석 실패는 check가 오류로 막는다 ----
  const stepByRef = Object.fromEntries(journeys.flatMap((j) => j.steps.map((s) => [`${j.id}/${s.id}`, { journey: j.id, step: s.id, label: `${j.title} › ${s.label}`, status: s.status, grade: s.grade, fixed: s.screenNodes.some((n) => (n.fixedVia || []).length) }])));
  const milestones = g.of('milestone').sort((a, b) => a.props.order - b.props.order);
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const releases = g.of('release').sort((a, b) => a.props.order - b.props.order);
  const releaseIds = new Set(releases.map((r) => r.id));
  const flowProblems = roadmapFlowProblems(milestones, releases);
  const roadmap = milestones.map((m) => {
    const p = m.props;
    const scenes = p.scenes.map((r) => stepByRef[r] ? { ref: r, ...stepByRef[r] } : { ref: r, missing: true });
    const trackedTasks = p.tasks.map((name) => { const t = taskView.find((x) => x.name === name); return t ? { name, title: t.title, stage: t.stage, status: t.status, pnDone: t.pnDone, pnOpen: t.pnOpen } : { name, missing: true }; });
    const problems = [...scenes.filter((s) => s.missing).map((s) => `장면 없음: ${s.ref}`), ...trackedTasks.filter((t) => t.missing).map((t) => `작업 폴더 없음: ${t.name}`), ...p.deps.filter((d) => !milestoneIds.has(d)).map((d) => `선행 항목 없음: ${d}`)];
    if (!ROADMAP_STATUS.includes(p.status)) problems.push(`알 수 없는 상태: ${p.status || '(비어 있음)'}`);
    if (p.milestone && !releaseIds.has(p.milestone)) problems.push(`마일스톤 없음 ${p.milestone}`);
    problems.push(...(flowProblems.get(m.id) || []));
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
    // 답이 없는 잔여 질문 합계(폐기 제외, 못 읽은 작업은 0으로 더하고 읽기 상태가 partial을 알린다)
    openQuestions: taskView.filter((t) => t.status !== '폐기').reduce((n, t) => n + (t.openQuestions || 0), 0),
    commits: commitView.length, warnings: journeys.reduce((n, j) => n + j.warnings, 0), orphans: Object.values(orphans).reduce((n, a) => n + a.length, 0),
    stepsLive: journeys.reduce((n, j) => n + j.counts.live, 0), stepsTotal: journeys.reduce((n, j) => n + j.steps.length, 0),
    grades: Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, journeys.reduce((n, j) => n + j.steps.filter((s) => s.grade === k).length, 0)])),
  };

  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), project: sem.project || cfg.project, head, deploy: homelab, testreport: report,
    // 결과 실행 목록(러너·출처·sha·시각·exit·최신 여부만, dirtyPaths는 싣지 않는다)
    testRuns: report?.runs || [],
    adapters: g.toJSON().adapters, semantic: { actors: sem.actors || {}, statusLegend: sem.statusLegend || {}, roles: sem.roles || [], readEmpty: sem.readEmpty || null, journeys },
    summary, orphans, coverage, tasks: taskView, roadmap, ledger, decisions: decisionView, plans, commits: commitView, areaCounts,
    screens: screenView, apis: apiView, functions: fnView, migrations: migView, tests: testView,
    milestones: milestoneView, issues: g.issues.map((i) => ({ ...i })), sources: { semantic: cfg.semantic, roadmap: cfg.roadmap?.file ?? null },
    // 읽기 상태 건수: 노드에 적힌 상태만 값별·필드별로 센다(적지 않은 필드는 rule로 보지만 세지 않는다)
    readings: countReadings([...g.nodes.values()]),
    // 판정 파일: 작업마다 판정 파일 경로·by·note와 적용·낡음·무효 항목 수(작업 폴더 이름 순). 파일 모양이 틀린 판정 파일은 issues에만 있다
    judgments: tasks.filter((t) => t.props.judged).map((t) => ({ task: t.id, file: t.props.judged, ...t.props.judgment })).sort((a, b) => a.task.localeCompare(b.task)),
  };
}

// 첫 화면 전용 조각: 시스템 식별자(경로·파일·sha)를 뺀다. 개요는 이것만 받는다.
// 창은 generatedAt의 Asia/Seoul 날짜로 끝나는 opts.sinceDays(기본 14)일, 커밋 수는 작성자가 [bot]으로 끝나지 않는 사람 커밋만 센다.
export function overviewSlice(d, opts = {}) {
  const A = d.semantic.actors;
  const days = opts.sinceDays ?? 14;
  const lastDay = Date.parse(`${seoulDay(d.generatedAt)}T00:00:00+09:00`);
  const dates = Array.from({ length: days }, (_, i) => seoulDay(lastDay - (days - 1 - i) * 864e5));
  const dayIndex = new Map(dates.map((x, i) => [x, i]));
  const zeros = () => new Array(days).fill(0);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const isBot = (c) => /\[bot\]$/.test(c.author || '');
  const inWindow = (d.commits || []).filter((c) => dayIndex.has(seoulDay(c.date)));
  const human = inWindow.filter((c) => !isBot(c));
  const act = { commits: zeros(), runtime: zeros(), bots: zeros() };
  for (const c of inWindow) { const i = dayIndex.get(seoulDay(c.date)); if (isBot(c)) act.bots[i] += 1; else { act.commits[i] += 1; if (c.runtime) act.runtime[i] += 1; } }

  // 기능별 계열, 단계 hits, 기능 쌍 연결(닿은 기능이 2개 이상·전체 절반 이하인 커밋만)
  const nJourneys = d.semantic.journeys.length;
  const series = {}, hits = {}, pairs = new Map();
  for (const c of human) {
    const i = dayIndex.get(seoulDay(c.date));
    const js = [...new Set(c.journeys.map((x) => x.journey))];
    for (const j of js) (series[j] ||= zeros())[i] += 1;
    for (const k of new Set(c.journeys.map((x) => `${x.journey}/${x.step}`))) hits[k] = (hits[k] || 0) + 1;
    if (js.length >= 2 && js.length <= Math.floor(nJourneys / 2)) {
      for (let a = 0; a < js.length; a++) for (let b = a + 1; b < js.length; b++) { const k = [js[a], js[b]].sort().join('|'); pairs.set(k, (pairs.get(k) || 0) + 1); }
    }
  }
  const links = [...pairs].map(([k, n]) => { const [a, b] = k.split('|'); return { a, b, n }; }).sort((x, y) => y.n - x.n || `${x.a}${x.b}`.localeCompare(`${y.a}${y.b}`)).slice(0, 30);

  // 로드맵 항목·마일스톤: 문구는 plain으로 줄이고, 항목 문구는 비완료만 싣는다
  const milestoneList = d.milestones || [];
  const milestoneById = new Map(milestoneList.map((m) => [m.id, m]));
  const roadmapItems = (d.roadmap || []).slice().sort((a, b) => a.order - b.order).map((r) => {
    const done = r.status === '완료';
    const waitingOn = done ? '' : plain(r.waitingOn, 140);
    const w = splitWaiting(waitingOn);
    const scenes = (r.scenes || []).filter((s) => !s.missing);
    return {
      id: r.id, order: r.order, title: r.title, status: r.status, mode: r.mode, milestone: milestoneById.has(r.milestone) ? r.milestone : null,
      goal: done ? '' : plain(r.goal, 140), waitingOn, waitingWho: w.who, waitingWhat: w.what, waitingSince: waitingOn ? r.waitingSince ?? null : null, completedAt: r.completedAt ?? null,
      sceneCounts: Object.fromEntries(STEP_STATUS.map((k) => [k, scenes.filter((s) => s.status === k).length])),
      tasks: (r.tasks || []).filter((t) => !t.missing).map((t) => ({ name: t.name, title: plain(t.title, 60), stage: t.stage, status: t.status, pnDone: t.pnDone, pnOpen: t.pnOpen })),
      blockedBy: r.blockedBy || [],
    };
  });
  const milestones = milestoneList.map((m) => {
    const waitingOn = plain(m.waitingOn, 140);
    const w = splitWaiting(waitingOn);
    return {
      id: m.id, order: m.order, title: m.title, status: m.status, goal: plain(m.goal, 140), completedOn: isDay(m.completedOn) ? m.completedOn : null, targetOn: isDay(m.targetOn) ? m.targetOn : null,
      waitingWho: w.who, waitingWhat: w.what, waitingSince: waitingOn ? m.waitingSince ?? null : null, items: m.items, steps: m.progress, plans: m.plans, blocked: m.blocked,
    };
  });
  const currentMilestone = (milestones.find((m) => m.status === '진행') || milestones.find((m) => m.status === '다음'))?.id ?? null;
  const openItems = (d.roadmap || []).filter((r) => r.status !== '완료').sort((a, b) => a.order - b.order);

  // 캡처: 기능마다 동작 단계의 캡처 파일을 단계 순서로 최대 5장. 중복 제거는 기능 안에서만 하고 전체 상한은 없다(1.3.0, DEC-23)
  const captures = [];
  for (const j of d.semantic.journeys) {
    const files = new Set();
    for (const s of j.steps) {
      if (files.size >= 5) break;
      if (s.status !== 'live' || !s.captureFile || files.has(s.captureFile)) continue;
      files.add(s.captureFile);
      captures.push({ file: s.captureFile, journey: j.id, step: s.id });
    }
  }
  const changes = human.slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 20).map((c) => {
    const touched = new Set(c.journeys.map((x) => x.journey));
    const titles = d.semantic.journeys.filter((j) => touched.has(j.id)).map((j) => j.title).slice(0, 3);
    return { date: new Date(c.date).toISOString(), kind: changeKind(c.subject), subject: subjectPlain(c.subject, 70), journeys: titles, journeysMore: touched.size - titles.length };
  });
  const stepCounts = Object.fromEntries(STEP_STATUS.map((k) => [k, 0]));
  for (const j of d.semantic.journeys) for (const s of j.steps) if (s.status in stepCounts) stepCounts[s.status] += 1;
  const lastRun = d.testreport ? { fresh: d.testreport.fresh, failures: d.testreport.failures, total: d.testreport.total, at: d.testreport.at } : null;
  return {
    generatedAt: d.generatedAt, project: d.project, headDate: d.head?.date || null,
    line: summaryLine(d),
    journeys: d.semantic.journeys.map((j) => {
      const item = openItems.find((r) => (r.scenes || []).some((s) => !s.missing && s.journey === j.id));
      const ms = item && milestoneById.get(item.milestone);
      const js = series[j.id] || zeros();
      return {
        id: j.id, title: j.title, actor: A[j.actor] || j.actor, lane: j.lane, status: j.status, warnings: j.warnings,
        steps: j.steps.map((s) => ({ id: s.id, label: s.label, status: s.status, grade: s.grade, warn: s.warnings.length > 0, hits: hits[`${j.id}/${s.id}`] || 0 })),
        goal: plain(j.goal, 80), counts: j.counts, roadmapItem: item ? { id: item.id, title: item.title, status: item.status } : null, milestone: ms ? { id: ms.id, title: ms.title, status: ms.status } : null,
        commits: sum(js), week: sum(js.slice(-7)), series: js,
      };
    }),
    running: d.ledger.running.map((r) => ({ work: r.work, owner: r.owner })),
    roadmap: d.roadmap.filter((m) => m.status !== '완료').slice(0, 4).map((m) => ({ id: m.id, title: m.title, status: m.status, mode: m.mode, live: m.progress.live, total: m.progress.total, waiting: !!m.waitingOn })),
    roadmapDone: d.roadmap.filter((m) => m.status === '완료').length, roadmapTotal: d.roadmap.length,
    waiting: d.ledger.waiting.filter((w) => !w.done).map((w) => ({ work: w.work, state: (w.state || '').split('(')[0] })),
    tasks: d.tasks.filter((t) => t.status !== '폐기' && t.status !== '기록').slice().sort((a, b) => (a.status === '진행' ? -1 : 1) - (b.status === '진행' ? -1 : 1) || b.recentCommits - a.recentCommits).slice(0, 6).map((t) => ({ id: t.name, title: t.title, stage: t.stage, status: t.status, pnDone: t.pnDone, pnOpen: t.pnOpen, oq: t.oq, openQuestions: t.openQuestions ?? null, reading: t.reading || {} })),
    signals: {
      deploy: d.deploy ? (d.deploy.behindRuntime === 0 ? 'ok' : d.deploy.behindRuntime === null ? 'unknown' : 'behind') : 'unknown', deployBehind: d.deploy?.behindRuntime ?? null,
      tests: d.testreport?.signal || (lastRun ? (lastRun.failures ? 'fail' : lastRun.fresh ? 'ok' : 'stale') : 'none'), lastRun,
      adapters: d.adapters.some((a) => a.status === 'failed') ? 'fail' : d.adapters.some((a) => a.status === 'partial') ? 'partial' : 'ok', adapterNotes: d.adapters.filter((a) => a.status !== 'ok').map((a) => `${a.name}: ${a.error}`),
      warnings: d.summary.warnings, orphans: d.summary.orphans, gated: d.tests.filter((t) => t.gated).reduce((n, t) => n + t.count, 0),
      deployBehindAll: d.deploy?.behind ?? null,
    },
    counts: { stepsLive: d.summary.stepsLive, stepsTotal: d.summary.stepsTotal, screensLive: d.summary.liveRoutes, screensFixed: d.summary.fixedRoutes, screens: d.summary.routes, apis: d.summary.apis, functions: d.summary.dbFunctions, tests: d.summary.tests, pnDone: d.summary.pnDone, pnTotal: d.summary.pnDone + d.summary.pnOpen, oq: d.summary.oq, openQuestions: d.summary.openQuestions, decisions: d.decisions.filter((x) => x.status === 'current').length, proposed: d.decisions.filter((x) => x.status === 'proposed').length, grades: d.summary.grades,
      steps: stepCounts, journeys: nJourneys, journeysLive: d.semantic.journeys.filter((j) => j.status === 'live').length, tasksRunning: d.tasks.filter((t) => t.status === '진행').length,
      // 개요 수치의 읽기 상태(값만, 경로·파일명 없음). 등급은 검사 결과 최신 여부와 화면→API 연결에 기댄다
      reading: {
        plans: combineReading(d.tasks.map((t) => readingOf(t, 'plan'))),
        openQuestions: combineReading(d.tasks.map((t) => readingOf(t, 'openQuestions'))),
        tests: combineReading(d.tests.map((t) => readingOf(t, 'count'))),
        grades: combineReading([...d.tests.map((t) => readingOf(t, 'lastRun')), ...d.screens.map((x) => readingOf(x, 'apis'))]),
      } },
    areas: Object.entries(d.areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
    recent: d.commits.filter((c) => c.journeys.length).slice(0, 6).map((c) => ({ date: c.date, subject: c.subject, scenes: c.journeys.map((x) => x.label) })),
    openQuestions: d.plans.filter((p) => p.oq).map((p) => ({ title: p.title, oq: p.oq })),
    roadmapItems, milestones, currentMilestone,
    activity: { sinceDays: days, days: dates.map((date, i) => ({ date, commits: act.commits[i], runtime: act.runtime[i], bots: act.bots[i] })), total: sum(act.commits), runtime: sum(act.runtime), bots: sum(act.bots) },
    changes, links, captures,
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
