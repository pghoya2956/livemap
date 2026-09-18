// 이슈 계약: 코드 표, g.issue 넷째 인자 검증, check 문제 정렬·JSON·묶음 줄·--strict.
// 코드 표의 뜻과 허용 처리는 docs/issue-codes.md가 정본이고, 이 표는 그 문서와 같은 코드 집합을 가진다(검사로 확인).
// 엔진은 원문과 판정 파일을 고치지 않는다. 처리(resolutions)는 이슈를 받은 에이전트 세션이 고르는 방법 목록이다.

export const RESOLUTIONS = ['source', 'judge', 'config', 'code', 'engine'];
export const ISSUE_SCHEMA = 1;
// 같은 새 코드가 이 수 이상이면 텍스트 출력에서 한 줄로 묶는다
export const GROUP_MIN = 6;
// --strict가 오류로 세는 경고의 코드 접두어
const STRICT_PREFIXES = ['tasks.', 'judgment.'];
const EXCERPT_MAX = 120;
const CODE_FORMAT = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

// level: 'error'|'warn'|null(부르는 쪽이 정함). target: 묶음 줄·문서에 쓰는 대상 이름. isNew: 1.2.0 새 코드(묶음 대상)
const code = (level, target, resolutions, isNew = false) => ({ level, target, resolutions, isNew });
export const ISSUE_CODES = {
  // 1.2.0 새 코드
  'tasks.unread-definition': code('warn', '작업', ['source', 'judge'], true),
  'tasks.unread-checklist': code('warn', '작업', ['source', 'judge'], true),
  'tasks.stage-unknown': code('warn', '작업', ['source'], true),
  'tasks.questions-unknown': code('warn', '작업', ['source', 'judge'], true),
  'tasks.questions-open-done': code('warn', '작업', ['judge'], true),
  'tasks.index-section-unknown': code('warn', '장부', ['source'], true),
  'tasks.ambiguous-ref': code('warn', '단계', ['source'], true),
  'judgment.invalid': code('error', '판정 파일', ['judge'], true),
  'judgment.stale': code('warn', '판정 파일', ['judge'], true),
  'router.unknown-api': code('warn', '화면', ['code', 'config'], true),
  'router.hookapi-redundant': code('warn', '설정', ['config'], true),
  'router.hookapi-only': code('warn', '설정', ['code', 'config'], true),
  'journey.api-not-observed': code('warn', '단계', ['source', 'code'], true),
  // 1.1.1 check 줄(문구는 그대로 두고 코드만 붙인다)
  'adapter.failed': code('error', '어댑터', ['code', 'engine']),
  'adapter.issue': code(null, '어댑터', []),
  'floor.below': code('error', '설정', ['code', 'config', 'engine']),
  'journey.duplicate-id': code('error', '여정', ['source']),
  'journey.no-steps': code('error', '여정', ['source']),
  'journey.actor-unknown': code('warn', '여정', ['source']),
  'step.duplicate-id': code('error', '여정', ['source']),
  'step.intent-empty': code('warn', '단계', ['source']),
  'step.route-missing': code('error', '단계', ['source', 'code']),
  'step.ref-unresolved': code('error', '단계', ['source']),
  'step.screen-not-live': code('error', '단계', ['source', 'code']),
  'step.screen-live-early': code('warn', '단계', ['source']),
  'step.no-evidence': code('error', '단계', ['source', 'code']),
  'step.review-stale': code('warn', '단계', ['source']),
  'step.warning': code(null, '단계', ['source']),
  'step.unknown-status': code('error', '단계', ['source']),
  'step.planned-has-screen': code('warn', '단계', ['source']),
  'step.capture-missing': code('warn', '단계', ['source']),
  'roadmap.duplicate-id': code('error', '로드맵 항목', ['source']),
  'roadmap.scene-missing': code('error', '로드맵 항목', ['source']),
  'roadmap.task-missing': code('error', '로드맵 항목', ['source']),
  'roadmap.dep-missing': code('error', '로드맵 항목', ['source']),
  'roadmap.unknown-status': code('error', '로드맵 항목', ['source']),
  'roadmap.milestone-missing': code('error', '로드맵 항목', ['source']),
  'roadmap.problem': code('error', '로드맵 항목', ['source']),
  'roadmap.running-no-task': code('warn', '로드맵 항목', ['source']),
  'roadmap.running-no-milestone': code('warn', '로드맵 항목', ['source']),
  'roadmap.running-open-deps': code('warn', '로드맵 항목', ['source']),
  // 1.3.0: 선행 흐름 경고
  'roadmap.dep-cycle': code('warn', '로드맵 항목', ['source']),
  'roadmap.milestone-backward': code('warn', '로드맵 항목', ['source']),
  'milestone.no-id': code('error', '마일스톤', ['source']),
  'milestone.duplicate-id': code('error', '마일스톤', ['source']),
  'milestone.unknown-status': code('error', '마일스톤', ['source']),
  'milestone.bad-date': code('error', '마일스톤', ['source']),
  'milestone.problem': code('error', '마일스톤', ['source']),
  'milestone.done-open-items': code('warn', '마일스톤', ['source']),
  'milestone.all-items-done': code('warn', '마일스톤', ['source']),
  'milestone.running-items': code('warn', '마일스톤', ['source']),
  'milestone.no-items': code('warn', '마일스톤', ['source']),
  'milestone.completed-on-mismatch': code('warn', '마일스톤', ['source']),
  'milestone.warning': code('warn', '마일스톤', ['source']),
  'milestone.multiple-running': code('warn', '마일스톤', ['source']),
  'orphan.screens': code('warn', '화면', ['source']),
  'orphan.apis': code('warn', 'API', ['code', 'source']),
  'orphan.tests': code('warn', '검사', ['code']),
  'deploy.behind-unknown': code('warn', '배포', ['config']),
};
export const NEW_CODES = new Set(Object.keys(ISSUE_CODES).filter((c) => ISSUE_CODES[c].isNew));

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const nonEmpty = (s) => typeof s === 'string' && s.length > 0;
// 근거 줄 조각: 120 코드 포인트까지(서로게이트 쌍을 가르지 않는다)
export const cutExcerpt = (s) => { const cp = [...s]; return cp.length > EXCERPT_MAX ? cp.slice(0, EXCERPT_MAX).join('') : s; };

// g.issue 넷째 인자를 검증해 기록할 필드를 돌려준다. 형식이 틀리면 throw(그 어댑터가 failed가 된다)
export function issueDetail(level, detail) {
  if (!isObj(detail)) throw new Error('issue 넷째 인자는 객체');
  for (const k of Object.keys(detail)) if (!['code', 'subject', 'anchors', 'resolutions', 'judgmentDraft'].includes(k)) throw new Error(`issue 넷째 인자에 모르는 키: ${k}`);
  if (typeof detail.code !== 'string' || !CODE_FORMAT.test(detail.code)) throw new Error(`issue code 형식은 <영역>.<이름>(소문자·숫자·하이픈): ${detail.code}`);
  const known = ISSUE_CODES[detail.code];
  if (known?.level && known.level !== level) throw new Error(`issue code ${detail.code}의 수준은 ${known.level}: ${level}`);
  let subject = null;
  if (detail.subject != null) {
    if (!isObj(detail.subject) || !nonEmpty(detail.subject.kind) || !nonEmpty(detail.subject.id)) throw new Error('issue subject는 { kind, id } 문자열');
    subject = { kind: detail.subject.kind, id: detail.subject.id };
  }
  let anchors = [];
  if (detail.anchors != null) {
    if (!Array.isArray(detail.anchors)) throw new Error('issue anchors는 배열');
    anchors = detail.anchors.map((a) => {
      if (!isObj(a) || !nonEmpty(a.file)) throw new Error('issue anchor는 file 문자열을 가진 객체');
      if (a.line != null && !(Number.isInteger(a.line) && a.line >= 1)) throw new Error(`issue anchor line은 1 이상 정수: ${a.line}`);
      if (a.excerpt != null && typeof a.excerpt !== 'string') throw new Error('issue anchor excerpt는 문자열');
      return a.excerpt == null ? { file: a.file, line: a.line ?? null } : { file: a.file, line: a.line ?? null, excerpt: cutExcerpt(a.excerpt) };
    });
  }
  let resolutions = known ? [...known.resolutions] : [];
  if (detail.resolutions != null) {
    if (!Array.isArray(detail.resolutions) || !detail.resolutions.every((r) => RESOLUTIONS.includes(r))) throw new Error(`issue resolutions 값은 ${RESOLUTIONS.join('·')}: ${JSON.stringify(detail.resolutions)}`);
    resolutions = [...detail.resolutions];
  }
  const out = { code: detail.code, subject, anchors, resolutions };
  if (detail.judgmentDraft != null) {
    if (!isObj(detail.judgmentDraft)) throw new Error('issue judgmentDraft는 객체');
    out.judgmentDraft = detail.judgmentDraft;
  }
  return out;
}

// check 문제 하나: { level, code, msg, subject, anchors, resolutions[, judgmentDraft] }
export function problem(level, codeName, msg, { subject = null, anchors = [], resolutions } = {}) {
  return { level, code: codeName, msg, subject, anchors, resolutions: resolutions ?? [...(ISSUE_CODES[codeName]?.resolutions || [])] };
}

// --strict: tasks.*·judgment.* 경고를 오류로 올린다(원래 목록은 바꾸지 않는다)
export function applyStrict(problems, strict) {
  if (!strict) return problems;
  return problems.map((p) => (p.level === 'warn' && STRICT_PREFIXES.some((x) => p.code.startsWith(x)) ? { ...p, level: 'error' } : p));
}

// 정렬: 수준(error 먼저) → 코드 → 첫 근거 파일 → 줄. 같으면 check 순서를 지킨다. 근거 없는 문제는 같은 코드 안에서 앞에 온다
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function sortProblems(problems) {
  return problems.map((p, i) => [p, i]).sort(([a, i], [b, j]) =>
    cmp(a.level === 'error' ? 0 : 1, b.level === 'error' ? 0 : 1) || cmp(a.code, b.code)
    || cmp(a.anchors[0]?.file ?? '', b.anchors[0]?.file ?? '') || cmp(a.anchors[0]?.line ?? 0, b.anchors[0]?.line ?? 0) || i - j).map(([p]) => p);
}

export function problemsJson(problems, engine) {
  const errors = problems.filter((p) => p.level === 'error').length;
  return { schema: ISSUE_SCHEMA, engine, errors, warnings: problems.length - errors, problems: sortProblems(problems) };
}

// 텍스트 줄: 1.1.1 줄은 그대로, 같은 새 코드가 GROUP_MIN건 이상이면 첫 자리에 한 줄로 묶는다
export function textLines(problems) {
  const byCode = new Map();
  for (const p of problems) if (NEW_CODES.has(p.code)) byCode.set(p.code, [...(byCode.get(p.code) || []), p]);
  const lines = [], grouped = new Set();
  for (const p of problems) {
    const group = byCode.get(p.code);
    if (group && group.length >= GROUP_MIN) {
      if (grouped.has(p.code)) continue;
      grouped.add(p.code);
      const subjects = new Set(group.filter((x) => x.subject).map((x) => `${x.subject.kind}:${x.subject.id}`));
      const sign = group.some((x) => x.level === 'error') ? '✗' : '△';
      lines.push(`${sign} ${p.code} ${group.length}건(${ISSUE_CODES[p.code].target} ${subjects.size}): livemap check --json`);
      continue;
    }
    lines.push(`${p.level === 'error' ? '✗' : '△'} ${p.msg}`);
  }
  return lines;
}
