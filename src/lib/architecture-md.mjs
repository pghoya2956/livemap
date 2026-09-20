// 선언 읽개(2.1.0, 스펙 「선언 파일 스키마」 PN-15, DEC-9·DEC-10·DEC-26·DEC-27): map/architecture/ 의 README.md(시스템 그림과 부품 표)와 부품 파일을
// md-props.mjs 의 parseSections 로 읽는다. 문서 모양만 읽고 대조(사실과 맞추기)는 src/architecture.mjs 가 한다.
//   README.md   ```mermaid flowchart``` 부분집합(mermaid-subset.mjs)과 표 | 부품 | 파일 | 이름 | 종류 |. 종류는 `우리 코드`·`바깥 상대`
//   부품 파일   머리 속성 `- id:`·`- 폴더:`(쉼표로 여럿)·`- 스키마:`(바깥 상대의 SQL 스키마, OQ09_DECISION=b,schema),
//               `## 층: <이름>` 절의 `- id:`·`- 폴더:`·`- 가져올 수 있는 층:`(줄이 없으면 규칙 없음 null, — 는 빈 목록),
//               `## 흐름: <이름>` 절의 `- id:`·`- 단계:`(여정/장면)·`- 지나는 곳:`(종류 낱말 여섯 `화면`·`파일`·`함수`·`API`·`DB 함수`·`테이블` + 좌표, → 로 이음)
// problems: 그림 못 읽음(architecture.diagram-unreadable), id 겹침(architecture.duplicate-id. 부품·층·흐름 사이, 층 id 는 노드 종류 이름과도 겹칠 수 없다),
//           부품 파일 없음(architecture.container-unanchored). 코드·수준은 src/lib/issues.mjs 표를 따른다
import { parseSections } from './md-props.mjs';
import { parseFlowchart } from './mermaid-subset.mjs';

export const PATH_KINDS = { '화면': 'screen', '파일': 'module', '함수': 'symbol', 'API': 'api', 'DB 함수': 'function', '테이블': 'table' };
// 층 id 로 쓸 수 없는 이름: 종류 층(화면·API·DB 함수·테이블·로그인)이 같은 id 공간에 선다
export const KIND_LANES = ['screen', 'api', 'function', 'table', 'auth'];
const LIST_KEYS = ['폴더', '가져올 수 있는 층', '스키마'];
const LINK = /\(([^)]+)\)/;
const clean = (s) => String(s ?? '').replace(/[  -  　]/g, ' ').replace(/`/g, '').trim();
const DASH = new Set(['—', '–', '-', '']);

// `지나는 곳` 한 줄 → 좌표 목록. 종류 낱말이 아니거나 좌표가 비면 bad 에 남긴다
export function parsePath(text) {
  const path = [], bad = [];
  for (const raw of clean(text).split(/\s*(?:→|->)\s*/)) {
    const token = raw.trim();
    if (!token) continue;
    const word = Object.keys(PATH_KINDS).sort((a, b) => b.length - a.length).find((w) => token.startsWith(w + ' '));
    const ref = word ? token.slice(word.length + 1).trim() : '';
    if (!word || !ref) { bad.push(token); continue; }
    path.push({ kind: PATH_KINDS[word], ref });
  }
  return { path, bad };
}

const rowFile = (cell) => { const c = clean(cell); if (DASH.has(c)) return null; const m = c.match(LINK); return m ? m[1].trim() : c; };
const rowKind = (cell) => (/바깥/.test(clean(cell)) ? 'external' : 'ours');

export function readArchitectureDir(fs, dir) {
  const problems = [];
  const problem = (code, message, file, line = null, subject = null) => problems.push({ code, message, file, line, subject });
  const readme = `${dir}/README.md`;
  const out = { dir, diagram: null, containers: [], links: [], boundaries: [], problems };
  if (!fs.has(readme)) { problem('architecture.diagram-unreadable', `${readme} 없음: 시스템 그림과 부품 표를 읽을 수 없다`, readme); return out; }
  const text = fs.read(readme);
  const diagram = parseFlowchart(text);
  if (diagram.ok) { out.diagram = diagram; out.links = diagram.edges.map((e) => ({ from: e.from, to: e.to })); out.boundaries = diagram.boundaries; }
  else problem('architecture.diagram-unreadable', `${readme}: flowchart LR|TD 로 시작하는 mermaid 그림을 찾지 못함`, readme, 1);
  const boundaryOf = new Map((diagram.ok ? diagram.nodes : []).map((n) => [n.id, n.boundary]));

  // 부품 표: 머리가 부품·파일·이름·종류인 첫 표
  const doc = parseSections(text, { head: true });
  const table = [...doc.tables, ...doc.children.flatMap((s) => s.tables)].find((t) => t.header && /부품/.test(t.header[0]) && t.rows.length) || null;
  const seen = new Map(); // id → 종류(부품·층·흐름) 겹침 검사
  const dup = (id, what, file, line) => {
    const prior = seen.get(id) ?? (what === '층' && KIND_LANES.includes(id) ? '노드 종류 이름' : null);
    if (prior) { problem('architecture.duplicate-id', `${what} id 겹침: ${id} (먼저 ${prior})`, file, line, id); return true; }
    seen.set(id, what); return false;
  };
  for (const row of table?.rows ?? []) {
    const [idCell, fileCell, nameCell, kindCell] = row;
    const id = clean(idCell);
    if (!id) continue;
    const line = fs.lineOf ? fs.lineOf(text, `| ${id} `) ?? fs.lineOf(text, `|${id}|`) : null;
    const rel = rowFile(fileCell);
    const c = { id, name: clean(nameCell) || id, kind: rowKind(kindCell), file: rel ? `${dir}/${rel}` : null, line, dirs: [], schemas: [], prose: '', boundary: boundaryOf.get(id) ?? null, lanes: [], flows: [] };
    if (dup(id, '부품', readme, line)) continue;
    out.containers.push(c);
    if (!c.file) continue;
    if (!fs.has(c.file)) { problem('architecture.container-unanchored', `부품 ${id} 의 파일 없음: ${c.file}`, readme, line, id); c.file = null; continue; }
    const part = parseSections(fs.read(c.file), { listKeys: LIST_KEYS, head: true });
    c.dirs = part.props['폴더'] ?? [];
    c.schemas = part.props['스키마'] ?? [];
    c.prose = part.prose;
    if (part.props.id && clean(part.props.id) !== id) problem('architecture.duplicate-id', `부품 ${id} 파일의 id 가 다름: ${part.props.id}`, c.file, 1, id);
    for (const s of part.children) {
      const m = s.title.match(/^(층|흐름)\s*[:：]\s*(.+)$/);
      if (!m) continue;
      const sid = clean(s.props.id);
      if (!sid) { problem('architecture.duplicate-id', `${c.file}:${s.line} ${m[1]} '${m[2]}' 에 id 없음`, c.file, s.line); continue; }
      if (m[1] === '층') {
        if (dup(sid, '층', c.file, s.line)) continue;
        c.lanes.push({ id: sid, name: m[2].trim(), dirs: s.props['폴더'] ?? [], allow: '가져올 수 있는 층' in s.props ? s.props['가져올 수 있는 층'] : null, line: s.line, prose: s.prose });
      } else {
        if (dup(sid, '흐름', c.file, s.line)) continue;
        const { path, bad } = parsePath(s.props['지나는 곳']);
        c.flows.push({ id: sid, name: m[2].trim(), step: clean(s.props['단계']) || null, path, bad, line: s.line, prose: s.prose });
      }
    }
  }
  return out;
}

export default readArchitectureDir;
