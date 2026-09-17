// 판정 파일: 에이전트 세션이 과거 작업 문서의 뜻을 판정해 적는 map/judgments/<작업 폴더>.json을 읽고 원문과 대조한다.
// 엔진은 읽기만 한다(원문과 판정 파일을 고치지 않고 LLM·네트워크를 부르지 않는다). 줄 번호는 근거로 쓰지 않는다.
//
// 필드: schema 1, task(파일 이름과 같은 작업 폴더), by agent·human, planFile(작업 폴더 기준 md), lines[{ at, as definition·ignore, id }],
//       questions.none { at } 또는 questions.items[{ id, state open·resolved, at }], note. 그 밖의 키는 무시한다(체크 여부·장부 상태·단계는 판정 대상이 아니다).
// 근거 조각 at { file 프로젝트 기준 경로, text 한 줄 안의 20 코드 포인트 이상 조각 }:
//   조각을 가진 줄이 하나면 확인(ok), 0개면 stale(원문이 바뀜), 둘 이상이면 invalid. 정의·질문 판정은 그 줄에 id가 있어야 한다.
// 파일 모양이 틀리면(JSON·스키마·폴더·planFile) 파일 전체를 적용하지 않고, 근거 조각이 틀린 항목은 그 항목만 적용하지 않는다.
export const JUDGMENTS_DIR = 'map/judgments';
export const TEXT_MIN = 20;
const BY = ['agent', 'human'];
const AS = ['definition', 'ignore'];
const STATES = ['open', 'resolved'];
const LABEL = '판정 파일';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
// 프로젝트 안 상대 경로만 받는다
const safeRel = (p) => nonEmpty(p) && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes('..');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 줄에 번호가 따로 있는지: 앞뒤가 영숫자(앞은 하이픈 포함)가 아니다. DEC-1은 DEC-12에 맞지 않는다
export const hasId = (line, id) => new RegExp(`(^|[^A-Za-z0-9-])${escapeRe(id)}(?![A-Za-z0-9])`).test(line);

// 근거 조각 대조: { state: 'ok'|'stale'|'invalid', file, line?, lines?, reason? }
export function locate(fs, at, id, linesOf) {
  if (!isObj(at) || !safeRel(at.file) || typeof at.text !== 'string') return { state: 'invalid', file: isObj(at) && typeof at.file === 'string' ? at.file : null, reason: '근거 조각 at은 { file: 프로젝트 기준 경로, text: 문자열 }' };
  const { file, text } = at;
  if (/[\r\n]/.test(text)) return { state: 'invalid', file, reason: `근거 조각이 여러 줄: ${file}` };
  if ([...text].length < TEXT_MIN) return { state: 'invalid', file, reason: `근거 조각이 ${TEXT_MIN}자 미만: ${file}` };
  if (!fs.has(file) || fs.isDir(file)) return { state: 'invalid', file, reason: `근거 파일 없음: ${file}` };
  const lines = linesOf(file);
  const hits = [];
  lines.forEach((l, i) => { if (l.includes(text)) hits.push(i + 1); });
  if (!hits.length) return { state: 'stale', file, reason: `근거 조각을 가진 줄이 원문에 없음: ${file}` };
  if (hits.length > 1) return { state: 'invalid', file, lines: hits, reason: `근거 조각을 가진 줄이 ${hits.length}개: ${file}` };
  if (id != null && !hasId(lines[hits[0] - 1], id)) return { state: 'invalid', file, lines: hits, reason: `근거 줄에 번호 ${id} 없음: ${file}:${hits[0]}` };
  return { state: 'ok', file, line: hits[0] };
}

// 파일 모양 검사: 문제 문장 목록
function shapeProblems(j, stem) {
  const out = [];
  if (j.schema !== 1) out.push('schema는 1');
  if (j.task !== stem) out.push(`task는 파일 이름과 같은 작업 폴더 이름(${stem})`);
  if (!BY.includes(j.by)) out.push(`by는 ${BY.join('·')}`);
  if (j.planFile != null && !(safeRel(j.planFile) && j.planFile.endsWith('.md'))) out.push('planFile은 작업 폴더 기준 md 경로');
  if (j.note != null && typeof j.note !== 'string') out.push('note는 문장');
  if (j.lines != null) {
    if (!Array.isArray(j.lines)) out.push('lines는 배열');
    else j.lines.forEach((e, i) => {
      if (!isObj(e)) { out.push(`lines[${i}]는 객체`); return; }
      if (!AS.includes(e.as)) out.push(`lines[${i}].as는 ${AS.join('·')}`);
      if (e.as === 'definition' && !nonEmpty(e.id)) out.push(`lines[${i}]: definition은 id 필수`);
      if (e.id != null && !nonEmpty(e.id)) out.push(`lines[${i}].id는 문자열`);
    });
  }
  if (j.questions != null) {
    const q = j.questions;
    if (!isObj(q)) out.push('questions는 객체');
    else {
      if (q.none != null && q.items != null) out.push('questions.none과 questions.items는 함께 쓰지 않는다');
      if (q.none != null && !isObj(q.none)) out.push('questions.none은 { at }');
      if (q.items != null) {
        if (!Array.isArray(q.items)) out.push('questions.items는 배열');
        else q.items.forEach((e, i) => {
          if (!isObj(e)) { out.push(`questions.items[${i}]는 객체`); return; }
          if (!nonEmpty(e.id)) out.push(`questions.items[${i}].id는 원문 표기 문자열`);
          if (!STATES.includes(e.state)) out.push(`questions.items[${i}].state는 ${STATES.join('·')}`);
        });
      }
    }
  }
  return out;
}

// 판정 파일을 모두 읽는다. taskNames: 작업 폴더 이름 집합, tasksDir: 설정 tasks.dir.
// 돌려주는 값: { byTask: Map(작업 → 판정), issues: [[level, code, message, detail]] }
//   판정 { file, task, by, note, planFile, lines[{ as, id, at, loc }], none { at, loc }|null, items[{ id, state, at, loc }], counts { applied, stale, invalid } }
export function readJudgments(fs, taskNames, tasksDir) {
  const byTask = new Map();
  const issues = [];
  if (!fs.isDir(JUDGMENTS_DIR)) return { byTask, issues };
  const cache = new Map();
  const linesOf = (rel) => { if (!cache.has(rel)) cache.set(rel, fs.read(rel).split(/\r?\n/)); return cache.get(rel); };
  const excerpt = (file, line) => (linesOf(file)[line - 1] ?? '').trim();
  for (const name of fs.ls(JUDGMENTS_DIR).filter((n) => n.endsWith('.json')).sort()) {
    const file = `${JUDGMENTS_DIR}/${name}`;
    if (fs.isDir(file)) continue;
    const stem = name.slice(0, -'.json'.length);
    const subject = { kind: 'judgment', id: stem };
    const self = { file, line: null };
    const invalid = (message, anchors = []) => issues.push(['error', 'judgment.invalid', message, { subject, anchors: [self, ...anchors] }]);
    let j;
    try { j = JSON.parse(fs.read(file)); } catch (e) { invalid(`JSON으로 읽지 못함(${e.message}): ${file}`); continue; }
    if (!isObj(j)) { invalid(`판정 파일은 JSON 객체: ${file}`); continue; }
    const shape = shapeProblems(j, stem);
    if (shape.length) { for (const s of shape) invalid(`스키마 위반(${s}): ${file}`); continue; }
    if (!taskNames.has(stem)) { invalid(`판정 대상 작업 폴더 없음: ${tasksDir}/${stem}`); continue; }
    const base = `${tasksDir}/${stem}`;
    if (j.planFile != null && (!fs.has(`${base}/${j.planFile}`) || fs.isDir(`${base}/${j.planFile}`))) { invalid(`planFile 없음: ${base}/${j.planFile}`); continue; }

    const counts = { applied: j.planFile != null ? 1 : 0, stale: 0, invalid: 0 };
    // 근거 조각 대조와 항목별 이슈. draftOf: stale 초안에 실을 판정 항목 모양(at: null)
    const check = (at, id, draftOf) => {
      const loc = locate(fs, at, id, linesOf);
      if (loc.state === 'ok') counts.applied += 1;
      else if (loc.state === 'invalid') {
        counts.invalid += 1;
        const anchors = loc.lines ? loc.lines.map((l) => ({ file: loc.file, line: l, excerpt: excerpt(loc.file, l) })) : loc.file && fs.has(loc.file) && !fs.isDir(loc.file) ? [{ file: loc.file, line: null }] : [];
        invalid(loc.reason, anchors);
      } else {
        counts.stale += 1;
        // 사라진 조각의 판정이 id를 가지면 같은 파일에서 그 id를 가진 줄이 후보
        loc.candidates = id != null ? linesOf(loc.file).map((l, i) => [l, i + 1]).filter(([l]) => hasId(l, id)).map(([, n]) => ({ file: loc.file, line: n, excerpt: excerpt(loc.file, n) })) : [];
        issues.push(['warn', 'judgment.stale', loc.reason, { subject, anchors: [self, { file: loc.file, line: null }], judgmentDraft: { task: stem, ...draftOf, candidates: loc.candidates } }]);
      }
      return loc;
    };
    const lines = (j.lines || []).map((e) => ({ as: e.as, id: e.id ?? null, at: e.at, loc: check(e.at, e.as === 'definition' ? e.id : null, { lines: [{ at: null, as: e.as, id: e.id ?? null }] }) }));
    const q = j.questions || {};
    const none = q.none != null ? { at: q.none.at, loc: check(q.none.at, null, { questions: { none: { at: null } } }) } : null;
    const items = (q.items || []).map((e) => ({ id: e.id, state: e.state, at: e.at, loc: check(e.at, e.id, { questions: { items: [{ id: e.id, state: e.state, at: null }] } }) }));
    byTask.set(stem, { file, task: stem, by: j.by, note: j.note ?? null, planFile: j.planFile ?? null, lines, none, items, counts });
  }
  return { byTask, issues };
}

export const JUDGMENT_LABEL = LABEL;
