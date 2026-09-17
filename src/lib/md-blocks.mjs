// md 블록 읽개: 마크다운 파일 하나를 줄 번호와 함께 블록으로 나눈다. 뜻(결정·계획 항목·질문)은 정하지 않는다.
// 블록 { type, line, path } — path는 감싼 제목 [{ level, text, line }](제목 블록은 자기 자신 포함)
//   heading { level, text }
//   item    { indent, marker, checkbox(' '|'x'|'X'|null), checked(true|false|null), text(체크박스 뒤 글자), head }
//   row     { cells, header(바로 아래가 구분 행), table(파일 안 표 번호, 1부터), head(첫 칸 머리 번호) }
//   text    { text } — 제목·목록·표가 아닌 빈 줄 아닌 줄
// 백틱·물결 코드 펜스(앞 공백 셋까지, 닫는 펜스는 같은 글자·같거나 긴 길이) 안 줄과 표 구분 행은 블록을 만들지 않는다. CRLF를 받는다.
// 머리 번호 head { id, bold, struck, rest }: 앞뒤 **·__를 벗기고 ~~ 취소선이면 struck. id 모양이 계획 항목인지 결정인지는 부르는 쪽이 정한다.
//
// 경계: 이 모듈은 줄 단위 블록까지만 만든다. 절 이름으로 역할을 정하거나(잔여 질문 절, 결정 절) 항목 속성(`키: 값`)을 해석하는
// 2단 파서는 이 블록 위에 올린다(작업 어댑터의 식별자 줄 문법, 뒤의 md 속성 파서). 인라인 링크·강조 해석, 들여쓴 코드 블록,
// HTML 블록, setext 제목은 다루지 않는다.

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const EMPTY_HEADING = /^ {0,3}(#{1,6})[ \t]*$/;
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const CHECKBOX = /^\[( |x|X)\](?:[ \t]+(.*)|)$/;
const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const ID = /^[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+/;
const WRAP = /^(\*\*|__|~~)/;

const indentOf = (s) => [...s].reduce((n, ch) => n + (ch === '\t' ? 4 - (n % 4) : 1), 0);

// 표 행 한 줄을 칸으로 나눈다. 앞뒤 파이프는 선택, 백슬래시로 이스케이프한 파이프는 칸 안 글자
export function splitCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i += 1; }
    else if (s[i] === '|') { cells.push(cur.trim()); cur = ''; }
    else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

// 글자 머리의 번호: 앞 **·__·~~를 벗기고 번호 모양 낱말을 찾는다. 번호 바로 뒤의 닫는 표시도 벗겨 rest에 남기지 않는다
export function headId(text) {
  let s = String(text ?? '').trimStart();
  let bold = false, struck = false;
  const opened = [];
  for (let m = s.match(WRAP); m; m = s.match(WRAP)) {
    if (m[1] === '~~') struck = true; else bold = true;
    opened.push(m[1]);
    s = s.slice(2);
  }
  const m = s.match(ID);
  if (!m) return null;
  let rest = s.slice(m[0].length);
  // 여는 표시의 반대 순서로 닫는 표시를 지운다. 번호 바로 뒤에 없으면(**DEC-10 [확정]**: …) 뒤에서 처음 나오는 것 하나를 지운다
  for (const w of opened.slice().reverse()) {
    if (rest.startsWith(w)) rest = rest.slice(w.length);
    else { const k = rest.indexOf(w); if (k >= 0) rest = rest.slice(0, k) + rest.slice(k + w.length); }
  }
  return { id: m[0], bold, struck, rest };
}

export function readBlocks(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const blocks = [];
  let path = [];
  let fence = null;
  let table = 0, inTable = false, tableStart = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = i + 1;
    const f = raw.match(FENCE);
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === '') fence = null;
      continue;
    }
    if (f && !(f[1][0] === '`' && f[2].includes('`'))) { fence = { ch: f[1][0], len: f[1].length }; inTable = false; continue; }
    if (!raw.trim()) { inTable = false; continue; }

    const h = raw.match(HEADING) || raw.match(EMPTY_HEADING);
    if (h) {
      const level = h[1].length;
      const heading = { level, text: (h[2] ?? '').trim(), line };
      path = [...path.filter((p) => p.level < level), heading];
      blocks.push({ type: 'heading', line, level, text: heading.text, path });
      inTable = false;
      continue;
    }
    if (raw.trimStart().startsWith('|')) {
      // 구분 행: 표 첫 행 바로 아래일 때만(그 행이 머리 행). 표 중간의 `| - | - |`는 대시 칸을 가진 행이다
      if (DELIM.test(raw) && (!inTable || tableStart === line - 1)) {
        const prev = blocks[blocks.length - 1];
        if (inTable && prev?.type === 'row' && prev.line === line - 1) prev.header = true;
        continue;
      }
      if (!inTable) { table += 1; inTable = true; tableStart = line; }
      const cells = splitCells(raw);
      blocks.push({ type: 'row', line, path, cells, header: false, table, head: headId(cells[0]) });
      continue;
    }
    inTable = false;
    const it = raw.match(ITEM);
    if (it) {
      const body = it[3] ?? '';
      const cb = body.match(CHECKBOX);
      const checkbox = cb ? cb[1] : null;
      const itemText = cb ? (cb[2] ?? '') : body;
      blocks.push({ type: 'item', line, path, indent: indentOf(it[1]), marker: it[2], checkbox, checked: checkbox === null ? null : checkbox !== ' ', text: itemText, head: headId(itemText) });
      continue;
    }
    blocks.push({ type: 'text', line, path, text: raw.trim() });
  }
  return blocks;
}
