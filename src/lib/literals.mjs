// 경로 리터럴: 글자에서 따옴표·백틱 바로 뒤가 /api/인 문자열을 뽑아 정규화하고 API 노드 경로에 대응한다.
// 접두어는 참조 bff 어댑터와 같이 고정이다. 따옴표 없이 주석에 쓴 경로와 변수로 조립한 경로는 잡히지 않는다.
//   정규화: ? 뒤를 자른다. 경로 조각 전체가 ${…}면 :param. 조각 중간에서 ${…}가 시작하면 앞 글자까지 남기고 열린 끝(open)
//   대응:   조각 수가 같고 각 조각이 같거나 한쪽이 :이름이면 맞다. 열린 끝은 앞부분이 맞으면 맞다(마지막 조각은 앞 글자 일치)
export const API_PREFIX = '/api/';
const QUOTES = new Set(["'", '"', '`']);

// 템플릿 리터럴 본문을 조각으로 나눈다: 글자는 문자열, ${…}는 { expr } (중첩 괄호·안쪽 문자열을 건너뛴다)
function templateParts(raw) {
  const parts = [];
  let text = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '\\') { text += raw.slice(i, i + 2); i += 1; continue; }
    if (raw[i] === '$' && raw[i + 1] === '{') {
      let depth = 1, j = i + 2, quote = null;
      for (; j < raw.length && depth > 0; j += 1) {
        const ch = raw[j];
        if (quote) { if (ch === '\\') j += 1; else if (ch === quote) quote = null; continue; }
        if (QUOTES.has(ch)) quote = ch;
        else if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
      }
      if (text) parts.push(text);
      parts.push({ expr: raw.slice(i + 2, j - 1) });
      text = '';
      i = j - 1;
      continue;
    }
    text += raw[i];
  }
  if (text) parts.push(text);
  return parts;
}

// 따옴표 안 글자(따옴표 제외) → { path, open? }. 백틱이 아니면 ${를 글자로 본다
export function normalizeApiLiteral(raw, template = true) {
  const parts = template ? templateParts(raw) : [raw];
  const segs = [];
  let cur = [], open = false;
  const flush = () => { segs.push(cur); cur = []; };
  outer: for (const p of parts) {
    if (typeof p !== 'string') { cur.push(p); continue; }
    for (const ch of p) {
      if (ch === '?' || ch === '#') break outer;
      if (ch === '/') flush(); else cur.push(ch);
    }
  }
  flush();
  // segs[0]은 첫 / 앞의 빈 조각
  const out = [];
  for (const seg of segs.slice(1)) {
    const exprs = seg.filter((x) => typeof x !== 'string');
    if (!exprs.length) { out.push(seg.join('')); continue; }
    if (seg.length === 1) { out.push(':param'); continue; }
    const at = seg.findIndex((x) => typeof x !== 'string');
    out.push(seg.slice(0, at).join(''));
    open = true;
    break;
  }
  while (!open && out.length > 1 && out[out.length - 1] === '') out.pop();
  const path = '/' + out.join('/');
  return open ? { path, open: true } : { path };
}

// 글자에서 API 리터럴을 뽑는다: [{ path, open?, line }]. startLine은 text 첫 줄의 줄 번호
export function extractApiLiterals(text, startLine = 1) {
  return extractPathLiterals(text, startLine, API_PREFIX);
}

// 같은 규칙으로 임의 접두어의 경로 리터럴을 뽑는다(화면 주소는 '/'). 백틱 템플릿의 ${…}는 :param이 된다
export function extractPathLiterals(text, startLine = 1, prefix = '/') {
  const out = [];
  let line = startLine;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') { line += 1; continue; }
    if (!QUOTES.has(ch) || !text.startsWith(prefix, i + 1)) continue;
    // 닫는 따옴표까지(백틱은 ${…} 안을 건너뛴다). 작은·큰따옴표는 줄을 넘지 않는다
    let j = i + 1, depth = 0;
    for (; j < text.length; j += 1) {
      const c = text[j];
      if (c === '\\') { j += 1; continue; }
      if (ch === '`') {
        if (c === '$' && text[j + 1] === '{') { depth += 1; j += 1; continue; }
        if (depth > 0) { if (c === '{') depth += 1; else if (c === '}') depth -= 1; continue; }
      } else if (c === '\n') break;
      if (c === ch && depth === 0) break;
    }
    if (j >= text.length || text[j] !== ch) continue;
    const raw = text.slice(i + 1, j);
    out.push({ ...normalizeApiLiteral(raw, ch === '`'), line });
    for (let k = i + 1; k < j; k += 1) if (text[k] === '\n') line += 1;
    i = j;
  }
  return out;
}

// API 노드 id("METHOD /api/x" 또는 "/api/x")의 경로
export const apiPathOf = (id) => String(id).replace(/^[A-Z]+\s+(?=\/)/, '');

const segMatch = (a, b) => a === b || a.startsWith(':') || b.startsWith(':');
export function matchesApi(lit, apiId) {
  const a = lit.path.split('/'), b = apiPathOf(apiId).split('/');
  if (!lit.open) return a.length === b.length && a.every((s, i) => segMatch(s, b[i]));
  if (b.length < a.length) return false;
  const last = a.length - 1;
  return a.every((s, i) => (i < last ? segMatch(s, b[i]) : segMatch(s, b[i]) || b[i].startsWith(s)));
}
