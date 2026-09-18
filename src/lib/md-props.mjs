// md 속성 파서: 제목 2단(`## `/`### `)으로 나눈 절마다 `- 키: 값` 속성, 목표 문장, md 표를 읽는다.
// md 블록 읽개(md-blocks.mjs) 위에 올린다. 코드 펜스 안 줄은 블록이 아니므로 자동으로 빠진다.
//
// 절 { level, title, line, props, prose, tables, children }
//   props  `- 키: 값` — 값의 백틱은 뗀다. listKeys에 든 키는 쉼표(,·，)로 나누고 대시 한 칸(—·-)은 뺀다.
//   items  `키: 값`이 아닌 목록 줄(글자 그대로)
//   prose  제목·목록·표가 아닌 줄을 공백으로 이어 붙인 것(절의 목표 문장)
//   tables { header, rows } — 칸은 원문 그대로(백틱만 뗀다). 구분 행은 들어오지 않는다.
//   children 한 단계 아래 절. 자식의 속성·문장은 부모에 섞이지 않는다.
//
// 경계: 키 이름을 필드로 옮기거나 값의 어휘를 판정하는 일은 부르는 어댑터가 한다. 이 모듈은 문서 모양만 읽는다.
import { readBlocks } from './md-blocks.mjs';

const KV = /^([^:：]{1,40})[:：]\s*(.*)$/;
const DASH = new Set(['—', '–', '-', '']);

const clean = (s) => String(s ?? '').replace(/`/g, '').trim();

const value = (key, raw, listKeys) => {
  const v = clean(raw);
  if (!listKeys.has(key)) return v;
  return v.split(/[,，]/).map((x) => x.trim()).filter((x) => x && !DASH.has(x));
};

const emptySection = (level, title, line) => ({ level, title, line, props: {}, items: [], prose: '', tables: [], children: [] });

// 절 하나에 블록을 담는다. 표는 표 번호로 묶는다.
function put(section, block, listKeys, tables) {
  if (block.type === 'item') {
    const text = clean(block.text);
    const m = text.match(KV);
    if (m) { section.props[m[1].trim()] = value(m[1].trim(), m[2], listKeys); return; }
    section.items.push(text); // `키: 값`이 아닌 목록 줄은 그대로 둔다(넘겨받는 일 목록 등)
    return;
  }
  if (block.type === 'row') {
    let t = tables.get(block.table);
    if (!t) { t = { header: null, rows: [] }; tables.set(block.table, t); section.tables.push(t); }
    const cells = block.cells.map(clean);
    if (block.header && !t.header) t.header = cells; else t.rows.push(cells);
    return;
  }
  if (block.type === 'text') section.prose = section.prose ? `${section.prose} ${block.text.trim()}` : block.text.trim();
}

// text → 절 배열. { head: true }면 문서 하나({ title, props, prose, tables, children })로 돌려준다.
// title은 첫 `# ` 제목이고 그 앞뒤의 `- 키: 값`이 문서 속성이다.
export function parseSections(text, { listKeys = [], levels = [2, 3], head = false } = {}) {
  const keys = new Set(listKeys);
  const [top, sub] = levels;
  const doc = emptySection(1, '', 0);
  const sections = [];
  const tablesOf = new Map(); // 절 → (표 번호 → 표)
  let current = doc, parent = null;
  const tables = (s) => { let m = tablesOf.get(s); if (!m) { m = new Map(); tablesOf.set(s, m); } return m; };

  for (const block of readBlocks(text)) {
    if (block.type === 'heading') {
      if (block.level < top) { if (!doc.title) { doc.title = clean(block.text); doc.line = block.line; } current = doc; parent = null; continue; }
      if (block.level === top) {
        current = emptySection(top, clean(block.text), block.line);
        parent = current;
        sections.push(current);
        continue;
      }
      if (block.level === sub && parent) {
        current = emptySection(sub, clean(block.text), block.line);
        parent.children.push(current);
        continue;
      }
      continue; // 더 깊은 제목은 지금 절에 붙는 글로 본다
    }
    put(current, block, keys, tables(current));
  }

  if (!head) return sections;
  doc.children = sections;
  return doc;
}

export default parseSections;
