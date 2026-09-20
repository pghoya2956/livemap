// Mermaid flowchart 부분집합 읽개(2.1.0, 스펙 「선언 파일 스키마」 DEC-21): README 의 첫 ```mermaid 펜스(없으면 원문 전체)에서
// `flowchart LR|TD` 한 줄, `subgraph <id>["<이름>"]`(중첩)·`end`, `<id>["<이름>"]`, `<a> --> <b>`(양끝에 라벨 선언 허용)만 읽고 그 밖의 문법
// (라벨 화살표·점선·classDef·style 등)은 경고 없이 무시하고 건수만 남긴다. 첫 줄을 못 찾으면 { ok: false, reason: 'no-flowchart' }(architecture.diagram-unreadable 의 근거).
// 외부 파서를 넣지 않는다(런타임 의존성 0). 사람이 쓴 그림이 그대로 화면 배치가 되므로 읽는 범위를 좁게 고정한다.
const FENCE_OPEN = /^\s*```\s*mermaid\s*$/i;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEAD = /^\s*flowchart\s+(LR|TD)\s*$/;
const ID = '[A-Za-z_][A-Za-z0-9_.-]*';
const LABEL = '(?:\\s*\\[\\s*"?([^"\\]]*?)"?\\s*\\])?';
const SUBGRAPH = new RegExp(`^\\s*subgraph\\s+(${ID})${LABEL}\\s*$`);
const END = /^\s*end\s*$/;
const NODE = new RegExp(`^\\s*(${ID})\\s*\\[\\s*"?([^"\\]]*?)"?\\s*\\]\\s*$`);
const BARE = new RegExp(`^\\s*(${ID})\\s*$`);
const EDGE = new RegExp(`^\\s*(${ID})${LABEL}\\s*-->\\s*(${ID})${LABEL}\\s*$`);

// md 원문이면 첫 mermaid 펜스 안 줄만, 아니면 전체 줄
function mermaidLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const open = lines.findIndex((l) => FENCE_OPEN.test(l));
  if (open < 0) return lines;
  const rest = lines.slice(open + 1);
  const close = rest.findIndex((l) => FENCE_CLOSE.test(l));
  return close < 0 ? rest : rest.slice(0, close);
}

export function parseFlowchart(text) {
  const lines = mermaidLines(text).map((l) => l.replace(/%%.*$/, '')).filter((l) => l.trim());
  const head = lines[0]?.match(HEAD);
  if (!head) return { ok: false, reason: 'no-flowchart' };
  const boundaries = [], nodes = [], edges = [];
  const nodeById = new Map(), edgeKeys = new Set();
  const stack = [];
  const node = (id, label, boundary) => { if (nodeById.has(id)) return; const n = { id, label: label ?? id, boundary }; nodeById.set(id, n); nodes.push(n); };
  let ignored = 0;
  for (const line of lines.slice(1)) {
    let m;
    if ((m = line.match(SUBGRAPH))) { boundaries.push({ id: m[1], label: m[2] ?? m[1], parent: stack.at(-1) ?? null }); stack.push(m[1]); continue; }
    if (END.test(line)) { if (stack.length) stack.pop(); continue; }
    if ((m = line.match(NODE))) { node(m[1], m[2], stack.at(-1) ?? null); continue; }
    if ((m = line.match(EDGE))) {
      node(m[1], m[2] ?? null, stack.at(-1) ?? null); node(m[3], m[4] ?? null, stack.at(-1) ?? null);
      const k = `${m[1]}\u0000${m[3]}`;
      if (!edgeKeys.has(k)) { edgeKeys.add(k); edges.push({ from: m[1], to: m[3] }); }
      continue;
    }
    if ((m = line.match(BARE))) { node(m[1], null, stack.at(-1) ?? null); continue; }
    ignored += 1;
  }
  return { ok: true, direction: head[1], boundaries, nodes, edges, ignored };
}

export default parseFlowchart;
