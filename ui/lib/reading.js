// 읽기 상태 표기(스펙 「읽기 상태」, DEC-4). 부분·낡음·모름은 "?"와 이유 분류, 판정이 채운 값은 "판정"으로 보인다.
// 읽기 상태가 없는 생성물(1.1.1)은 값을 그대로 보인다.

/** "?"를 붙이는 상태 */
export const UNSURE = new Set(['partial', 'stale', 'unknown']);
export const unsure = (state) => UNSURE.has(state);

/** 상태 이름(더보기 요약) */
export const READING_WORD = { observed: '관측', rule: '규칙', judged: '판정', partial: '부분', stale: '낡음', unknown: '모름', none: '대상 없음' };
export const READING_ORDER = ['observed', 'rule', 'judged', 'partial', 'stale', 'unknown', 'none'];

/** 필드 이름(노드 종류.필드 또는 작업 필드) */
export const FIELD_WORD = {
  plan: '계획 항목', openQuestions: '열린 질문', stage: '단계',
  'task.plan': '작업 계획 항목', 'task.openQuestions': '작업 열린 질문', 'task.stage': '작업 단계',
  'test.count': '검사 개수', 'test.lastRun': '검사 결과', 'screen.apis': '화면 API 연결', 'deploy.behind': '미배포 커밋',
  plans: '계획 항목 합계', tests: '검사', grades: '확인 등급',
};

/**
 * 값과 상태로 화면 글자를 만든다. partial은 값 뒤 "?"(예: 48/61?), stale·unknown은 "?", none은 빈 칸.
 * keep이 참이면(단계 문자열처럼 1.1.1 값을 두는 글자) stale·unknown도 값 뒤에 "?"를 붙인다.
 */
export function readingText(value, state, { keep = false } = {}) {
  if (state === 'none') return '';
  if (state === 'partial') return `${value}?`;
  if (state === 'stale' || state === 'unknown') return keep ? `${value}?` : '?';
  return value;
}

// 이슈 코드 → 이유 분류. 작업 문제는 모두 판정이나 원문 수정으로 풀린다.
const CODE_WHY = {
  'tasks.questions-open-done': '판정 필요',
  'tasks.questions-unknown': '형식 밖',
  'tasks.unread-definition': '읽지 못한 줄 있음',
  'tasks.unread-checklist': '읽지 못한 줄 있음',
  'tasks.stage-unknown': '파이프라인 문서 없음',
  'judgment.stale': '판정 근거 바뀜',
  'judgment.invalid': '판정 파일 오류',
};
// 필드별 이슈 코드(작업 상세에서 이유를 고를 때)
const FIELD_CODES = {
  openQuestions: ['judgment.stale', 'tasks.questions-open-done', 'tasks.unread-definition', 'tasks.questions-unknown'],
  plan: ['judgment.stale', 'tasks.unread-checklist'],
  stage: ['tasks.stage-unknown'],
};

/**
 * "?" 옆에 붙는 짧은 이유 분류. 파일·줄은 넣지 않는다(개요에도 쓰므로).
 * field: 작업 필드(plan·openQuestions·stage), 개요 합계(plans·openQuestions·tests·grades), 검사 필드(count·lastRun)
 * codes: 그 대상에 걸린 이슈 코드 목록(작업 화면), task: 작업 자료(검토 전 구분)
 */
export function whyText(field, state, { codes = [], task = null } = {}) {
  if (!unsure(state)) return '';
  const hit = (FIELD_CODES[field] || []).find((c) => codes.includes(c));
  if (hit) return CODE_WHY[hit];
  if (state === 'stale') return field === 'lastRun' || field === 'grades' ? '검사 뒤 코드 변경' : '판정 근거 바뀜';
  if (state === 'unknown') {
    if (field === 'stage') return '파이프라인 문서 없음';
    if (field === 'openQuestions' && task?.spec && task.spec.initial && !task.spec.final) return '검토 전';
    if (field === 'lastRun' || field === 'grades') return '검사 결과 없음';
    if (field === 'plan' || field === 'plans') return '계획 파일 불분명';
    return '형식 밖';
  }
  if (field === 'count' || field === 'tests') return '템플릿 제목 있음';
  if (field === 'grades') return '검사 결과 확인 필요';
  if (field === 'openQuestions' || field === 'plans') return '판정 필요';
  return '읽지 못한 줄 있음';
}

/** 이슈를 대상(작업) 이름별로 묶는다. 작업 문제와 그 작업의 판정 파일 문제만. */
export function issuesByTask(issues) {
  const m = new Map();
  for (const x of issues || []) {
    const s = x.subject;
    if (!s || (s.kind !== 'task' && s.kind !== 'judgment')) continue;
    if (!m.has(s.id)) m.set(s.id, []);
    m.get(s.id).push(x);
  }
  return m;
}

/** 처리 방법 이름 */
export const RESOLUTION_WORD = { source: '원문 수정', judge: '판정', config: '설정', code: '코드', engine: '엔진' };
