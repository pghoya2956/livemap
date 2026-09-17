// 읽기 상태: 수치마다 "어떻게 읽었나"를 싣는다. 못 읽은 값과 0을 가르고, 화면은 부분·낡음·모름을 "?"로 보인다.
// 어댑터는 노드(g.add·g.get이 돌려준 것)에 setReading으로 필드별 상태를 적는다. 적지 않은 필드는 rule로 본다.
//   props.reading      { 필드: 값 }
//   props.readingNotes { 필드: 이유 문장 }  파일·줄이 들어갈 수 있어 개요 조각에는 싣지 않는다
// 값: observed 생산자 구조화 출력·livemap 소유 형식, rule 규칙으로 읽고 후보 줄이 모두 읽힘, judged 판정 파일로 채움·고침,
//     partial 안 읽힌 후보 줄·뜻 확인 필요, stale 판정 근거가 사라졌거나 검사 결과 뒤 코드 변경, unknown 소스 없음·형식 밖, none 셀 대상 없음
export const READING_VALUES = ['observed', 'rule', 'judged', 'partial', 'stale', 'unknown', 'none'];
const BAD = new Set(['partial', 'stale', 'unknown']);
export const DEFAULT_READING = 'rule';

export function setReading(node, field, value, note) {
  if (!node || typeof node !== 'object' || !node.props) throw new Error('reading 대상은 그래프 노드');
  if (typeof field !== 'string' || !field) throw new Error(`reading 필드는 빈 문자열이 아닌 이름: ${field}`);
  if (!READING_VALUES.includes(value)) throw new Error(`reading 값은 ${READING_VALUES.join('·')}: ${value}`);
  if (note !== undefined && typeof note !== 'string') throw new Error('reading 이유는 문자열');
  node.props.reading = { ...(node.props.reading || {}), [field]: value };
  const notes = { ...(node.props.readingNotes || {}) };
  if (note) notes[field] = note; else delete notes[field];
  node.props.readingNotes = notes;
  return node;
}

// 노드(또는 props·파생 뷰처럼 reading을 가진 객체)의 필드 상태. 적지 않았으면 fallback
export function readingOf(x, field, fallback = DEFAULT_READING) {
  const r = x?.props ? x.props.reading : x?.reading;
  return r?.[field] ?? fallback;
}

const norm = (v) => (READING_VALUES.includes(v) ? v : 'unknown');

// 합계: none은 빼고, 하나라도 partial·stale·unknown이면 partial. 나머지는 judged > rule > observed 순으로 가장 약한 근거를 쓴다.
// 구성 요소가 없으면 empty(기본 rule: 셀 대상이 없어 0을 규칙으로 읽은 것과 같다)
export function combineReading(values, empty = DEFAULT_READING) {
  const vs = values.map(norm).filter((v) => v !== 'none');
  if (!vs.length) return empty;
  if (vs.some((v) => BAD.has(v))) return 'partial';
  if (vs.includes('judged')) return 'judged';
  if (vs.includes('rule')) return 'rule';
  return 'observed';
}

// 노드에 적힌 상태만 센다: values는 값별 건수(모든 값 키), fields는 '<종류>.<필드>'별 값 건수
export function countReadings(nodes) {
  const values = Object.fromEntries(READING_VALUES.map((v) => [v, 0]));
  const fields = {};
  for (const n of nodes) {
    for (const [field, raw] of Object.entries(n.props?.reading || {})) {
      const v = norm(raw);
      values[v] += 1;
      const f = (fields[`${n.kind}.${field}`] ||= {});
      f[v] = (f[v] || 0) + 1;
    }
  }
  return { values, fields };
}
