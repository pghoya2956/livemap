// 검증: 생성물 바이트 비교가 아니라 뜻(여정)과 사실(코드)의 정합을 본다.
// error → CI 실패. warn → 화면에 뜨는 경고와 같은 것들.
// 문제마다 이슈 계약 코드(docs/issue-codes.md)를 붙인다. 문구(msg)와 순서는 1.1.1 텍스트 출력 그대로다.
import { problem } from './lib/issues.mjs';

// derive가 만든 완성 문장을 코드로 가른다. 맞는 규칙이 없으면 마지막 대체 코드
const STEP_WARNING = [[/^라우트 없음/, 'step.route-missing'], [/^참조 미해결/, 'step.ref-unresolved'], [/^장면은 동작인데/, 'step.screen-not-live'], [/^장면은 \S+인데 화면은 동작/, 'step.screen-live-early'], [/관측 근거 없음/, 'step.no-evidence'], [/^확인 필요/, 'step.review-stale']];
// 로드맵 problem 중 경고로 내는 문장(1.3.0). 선행 흐름 문제라 화면은 멈추지 않고 CI도 막지 않는다
const ROADMAP_WARNING = [[/^선행 순환/, 'roadmap.dep-cycle'], [/^마일스톤 순서 역행/, 'roadmap.milestone-backward']];
const ROADMAP_PROBLEM = [[/^장면 없음/, 'roadmap.scene-missing'], [/^작업 폴더 없음/, 'roadmap.task-missing'], [/^선행 항목 없음/, 'roadmap.dep-missing'], [/^알 수 없는 상태/, 'roadmap.unknown-status'], [/^마일스톤 없음/, 'roadmap.milestone-missing']];
const MILESTONE_PROBLEM = [[/: id 없음$/, 'milestone.no-id'], [/^마일스톤 id 중복/, 'milestone.duplicate-id'], [/: 알 수 없는 상태 /, 'milestone.unknown-status'], [/: 날짜 형식 /, 'milestone.bad-date']];
const MILESTONE_WARNING = [[/: 완료인데 미완료 항목/, 'milestone.done-open-items'], [/: 항목이 모두 완료인데 상태/, 'milestone.all-items-done'], [/: 진행 항목이 있는데 상태/, 'milestone.running-items'], [/: 묶인 항목 없음$/, 'milestone.no-items'], [/: 완료일과 상태가 맞지 않음$/, 'milestone.completed-on-mismatch']];
const pick = (rules, text, fallback) => rules.find(([re]) => re.test(text))?.[1] || fallback;

// 이슈 계약 모양의 문제 목록: { level, code, msg, subject, anchors, resolutions }
export function checkProblems(d, cfg) {
  const out = [];
  const err = (code, msg, extra) => out.push(problem('error', code, msg, extra));
  const warn = (code, msg, extra) => out.push(problem('warn', code, msg, extra));
  const subj = (kind, id) => ({ subject: { kind, id: String(id) } });

  for (const a of d.adapters) if (a.status === 'failed') err('adapter.failed', `어댑터 실패 ${a.name}: ${a.error}`, subj('adapter', a.name));
  const counts = { screen: d.summary.routes, api: d.summary.apis, function: d.summary.dbFunctions, test: d.tests.length, task: d.tasks.length, decision: d.decisions.length };
  for (const [k, floor] of Object.entries(cfg.floors || {})) if ((counts[k] ?? 0) < floor) err('floor.below', `바닥값 미달 ${k}: ${counts[k] ?? 0} < ${floor} (스캐너가 깨졌을 가능성)`, subj('config', `floors.${k}`));

  const ids = new Set();
  for (const j of d.semantic.journeys) {
    const js = subj('journey', j.id);
    if (ids.has(j.id)) err('journey.duplicate-id', `여정 id 중복: ${j.id}`, js); ids.add(j.id);
    if (!j.steps?.length) err('journey.no-steps', `여정에 장면 없음: ${j.id}`, js);
    const stepIds = new Set();
    for (const s of j.steps) {
      const ss = subj('step', `${j.id}/${s.id}`);
      if (stepIds.has(s.id)) err('step.duplicate-id', `${j.title}: 장면 id 중복 ${s.id}`, js); stepIds.add(s.id);
      if (!s.intent && s.status !== 'next') warn('step.intent-empty', `${j.title} › ${s.label}: intent 비어 있음`, ss);
      for (const w of s.warnings) (/라우트 없음|참조 미해결|장면은 동작인데|관측 근거 없음/.test(w) ? err : warn)(pick(STEP_WARNING, w, 'step.warning'), `${j.title} › ${s.label}: ${w}`, ss);
      if (!['live', 'mock', 'planned', 'next'].includes(s.status)) err('step.unknown-status', `${j.title} › ${s.label}: 알 수 없는 상태 ${s.status}`, ss);
      if (s.status === 'planned' && (s.screens || []).length) warn('step.planned-has-screen', `${j.title} › ${s.label}: planned 인데 화면이 있음(mock 이 맞는지 확인)`, ss);
      if (s.capture && !s.captureFile) warn('step.capture-missing', `${j.title} › ${s.label}: 캡처 파일 없음 ${s.capture}`, ss);
    }
  }
  // 로드맵: 가리키는 장면·작업·선행 항목이 없거나 상태 어휘가 틀리면 오류. 진행 중인데 작업 폴더가 없으면 경고.
  const mids = new Set();
  for (const m of d.roadmap || []) {
    const ms = subj('milestone', m.id);
    if (mids.has(m.id)) err('roadmap.duplicate-id', `로드맵 id 중복: ${m.id}`, ms); mids.add(m.id);
    for (const p of m.problems) {
      const w = pick(ROADMAP_WARNING, p, null);
      if (w) warn(w, `로드맵 ${m.title}: ${p}`, ms);
      else err(pick(ROADMAP_PROBLEM, p, 'roadmap.problem'), `로드맵 ${m.title}: ${p}`, ms);
    }
    if (m.status === '진행' && !m.tasks.length) warn('roadmap.running-no-task', `로드맵 ${m.title}: 진행인데 작업 폴더가 없음`, ms);
  }
  // 마일스톤: 문장은 derive가 만든다. 마일스톤 절이 없으면 줄이 없다
  for (const m of d.milestones || []) {
    const rs = subj('release', m.id);
    for (const p of m.problems) err(pick(MILESTONE_PROBLEM, p, 'milestone.problem'), p, rs);
    for (const w of m.warnings) warn(pick(MILESTONE_WARNING, w, 'milestone.warning'), w, rs);
  }
  const running = (d.milestones || []).filter((m) => m.status === '진행');
  if (running.length > 1) warn('milestone.multiple-running', `진행 마일스톤 ${running.length}개: ${running.map((m) => m.title).join(', ')}`);
  for (const m of d.roadmap || []) {
    if (m.status !== '진행') continue;
    const ms = subj('milestone', m.id);
    if ((d.milestones || []).length && !m.milestone) warn('roadmap.running-no-milestone', `로드맵 ${m.title}: 진행인데 마일스톤 없음`, ms);
    const open = (m.deps || []).filter((x) => x.status !== '완료');
    if (open.length) warn('roadmap.running-open-deps', `로드맵 ${m.title}: 진행인데 선행 미완 ${open.map((x) => x.title).join(', ')}`, ms);
  }
  // 배우 사전: 여정 배우, 여정과 다른 단계 배우가 사전 키에 없으면 경고(사전이 없는 프로젝트는 건너뜀)
  const actors = d.semantic.actors || {};
  if (Object.keys(actors).length) for (const j of d.semantic.journeys) {
    if (j.actor && !(j.actor in actors)) warn('journey.actor-unknown', `${j.title}: 배우 사전에 없는 값 ${j.actor}`, subj('journey', j.id));
    for (const s of j.steps) if (s.actor && s.actor !== j.actor && !(s.actor in actors)) warn('journey.actor-unknown', `${j.title} › ${s.label}: 배우 사전에 없는 값 ${s.actor}`, subj('step', `${j.id}/${s.id}`));
  }
  // 여정 정본(md 디렉터리) 규칙: 하위 유형 어휘·넘김 짝·시작 지점·사용자 확인 뒤 변경.
  // 역할 정보가 없는 프로젝트(1.x JSON 여정)에서는 건너뛴다.
  const roles = d.semantic.roles || [];
  if (roles.length) {
    const stepIds = new Set(d.semantic.journeys.flatMap((j) => j.steps.map((s) => `${j.id}/${s.id}`)));
    const byRole = new Map(roles.map((r) => [r.slug, r]));
    const roleByLabel = new Map(roles.map((r) => [(actors[r.slug] || r.slug), r]));
    const anchorsOf = (r) => [{ file: r.file, line: 1 }];
    for (const r of roles) {
      const declared = new Set((r.subtypes || []).map((x) => x.name));
      const starts = [r.startStep, ...(r.subtypes || []).map((x) => x.start)].filter(Boolean);
      for (const start of new Set(starts)) {
        if (!stepIds.has(start)) err('journey.start-unknown', `${r.file}: 시작 지점이 단계 ID가 아님 ${start}`, { subject: { kind: 'journeyDoc', id: r.slug }, anchors: anchorsOf(r), resolutions: ['source'] });
      }
      if (r.changedAfterReview) {
        warn('journey.doc-changed-after-review', `${r.file}: 사용자 확인(${r.reviewedAt}) 뒤에 바뀜`, { subject: { kind: 'journeyDoc', id: r.slug }, anchors: anchorsOf(r), resolutions: ['source'] });
      }
      // 하위 유형 어휘: 그 역할 파일의 단계가 쓰는 `하는 사람`이 표에 있어야 한다
      if (declared.size) {
        for (const j of d.semantic.journeys.filter((x) => x.actor === r.slug)) {
          for (const s of j.steps) {
            for (const name of s.subtypes || []) {
              if (!declared.has(name)) warn('journey.subtype-unknown', `${j.title} › ${s.label}: 하위 유형 표에 없는 값 ${name}`, { subject: { kind: 'step', id: `${j.id}/${s.id}` }, anchors: anchorsOf(r), resolutions: ['source'] });
            }
          }
        }
      }
    }
    // 넘김 짝: 가리키는 단계가 있어야 하고, 받는 역할 파일의 `넘겨받는 일`에 그 단계가 적혀 있어야 한다
    for (const j of d.semantic.journeys) {
      for (const s of j.steps) {
        for (const h of s.handoffs || []) {
          const ss = { subject: { kind: 'step', id: `${j.id}/${s.id}` }, resolutions: ['source'] };
          if (!stepIds.has(h.step)) { err('journey.handoff-missing-step', `${j.title} › ${s.label}: 넘김 대상 단계가 없음 ${h.step}`, ss); continue; }
          const target = roleByLabel.get(h.role) || byRole.get(h.role);
          if (!target) { warn('journey.handoff-unpaired', `${j.title} › ${s.label}: 넘김 받는 역할을 찾지 못함 ${h.role}`, ss); continue; }
          if (!(target.handoffs || []).includes(h.step)) warn('journey.handoff-unpaired', `${j.title} › ${s.label}: ${target.file}의 넘겨받는 일에 ${h.step}이 없음`, ss);
        }
      }
    }
  }
  if (d.orphans.screens.length) warn('orphan.screens', `여정에 없는 화면 ${d.orphans.screens.length}: ${d.orphans.screens.join(', ')}`);
  if (d.orphans.apis.length) warn('orphan.apis', `어느 화면도 부르지 않는 API ${d.orphans.apis.length}: ${d.orphans.apis.join(', ')}`);
  if (d.orphans.tests.length) warn('orphan.tests', `라우트·API에 붙지 않는 검사 ${d.orphans.tests.length}: ${d.orphans.tests.join(', ')}`);
  if (d.deploy && d.deploy.behind === null) warn('deploy.behind-unknown', '배포 sha가 main 이력에 없어 뒤처짐을 계산하지 못함', subj('deploy', 'homelab'));
  // 어댑터가 g.issue로 낸 문제: 기존 검사 뒤에 그대로 싣는다. error는 종료 코드 1에 센다. 코드 없이 낸 문제는 adapter.issue
  for (const i of d.issues || []) {
    const p = problem(i.level, i.code || 'adapter.issue', `${i.label}: ${i.message}`, { subject: i.subject ?? null, anchors: i.anchors || [], resolutions: i.resolutions || [] });
    if (i.judgmentDraft) p.judgmentDraft = i.judgmentDraft;
    out.push(p);
  }
  return out;
}

// 1.1.1 모양({ level, msg })의 문제 목록. 텍스트 출력과 기존 호출자가 쓴다
export function check(d, cfg) {
  return checkProblems(d, cfg).map(({ level, msg }) => ({ level, msg }));
}

// check --staged: 커밋 전 훅이 쓰는 고르기. 대상은 스테이징된 tasks.dir 안 작업 폴더 파일·장부(tasks.index)와 map/judgments/*.json이다.
// 대상 파일에 걸린 tasks.*·judgment.* 문제만 오류로 센다. 걸림은 문제 대상(작업·장부·판정 파일)이 스테이징된 작업 폴더·판정 파일이거나
// 근거 줄이 스테이징된 대상 파일에 있는 것이다. 대상이 단계(여정 refs)인 문제는 고칠 곳이 여정 파일이라 세지 않는다.
const STAGED_PREFIXES = ['tasks.', 'judgment.'];
const STAGED_SUBJECTS = ['task', 'ledger', 'judgment'];
const JUDGMENT_FILE = /^map\/judgments\/([^/]+)\.json$/;
const taskFolderOf = (path, dir) => { if (!dir || !path.startsWith(`${dir}/`)) return null; const m = path.slice(dir.length + 1).match(/^(\d{8}-[^/]+)\//); return m ? m[1] : null; };

export function stagedTargets(paths, cfg) {
  const dir = cfg?.tasks?.dir ? cfg.tasks.dir.replace(/^\.\//, '').replace(/\/+$/, '') : null;
  const index = cfg?.tasks?.index ? cfg.tasks.index.replace(/^\.\//, '') : null;
  return paths.filter((p) => taskFolderOf(p, dir) || (index && p === index) || JUDGMENT_FILE.test(p));
}

export function stagedProblems(problems, paths, cfg) {
  const targets = stagedTargets(paths, cfg);
  const dir = cfg?.tasks?.dir ? cfg.tasks.dir.replace(/^\.\//, '').replace(/\/+$/, '') : null;
  const files = new Set(targets);
  const folders = new Set(targets.map((p) => taskFolderOf(p, dir)).filter(Boolean));
  const judged = new Set(targets.map((p) => p.match(JUDGMENT_FILE)?.[1]).filter(Boolean));
  return problems.filter((p) => STAGED_PREFIXES.some((x) => p.code.startsWith(x)) && STAGED_SUBJECTS.includes(p.subject?.kind) && (
    p.anchors.some((a) => files.has(a.file))
    || (p.subject.kind === 'task' && folders.has(p.subject.id))
    || (p.subject.kind === 'judgment' && (judged.has(p.subject.id) || folders.has(p.subject.id)))
  )).map((p) => ({ ...p, level: 'error' }));
}

// 훅 출력: 문제마다 코드·문구, 처리, 근거 줄, 판정 초안. 받은 에이전트 세션이 판정 파일을 쓰거나 원문을 고친다
export function stagedText(problems) {
  const lines = [];
  for (const p of problems) {
    lines.push(`✗ ${p.code} ${p.msg}`);
    if (p.resolutions.length) lines.push(`  처리: ${p.resolutions.join('·')}`);
    for (const a of p.anchors) lines.push(`  근거: ${a.file}${a.line ? `:${a.line}` : ''}${a.excerpt ? ` ${a.excerpt}` : ''}`);
    if (p.judgmentDraft) lines.push(`  판정 초안(judgmentDraft): ${JSON.stringify(p.judgmentDraft)}`);
  }
  return lines;
}
