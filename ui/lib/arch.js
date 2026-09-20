// 구조 화면 배치: 부품·층·묶음·길의 좌표와 선을 계산한다. data.json 의 architecture 절(과 함수 수준일 때 architecture.json)만 받는
// 순수 함수라 JSX 없이 단위 검사가 부른다. 배치는 결정적이다 — 같은 입력이면 같은 좌표이고 힘 배치를 쓰지 않는다(SC-11·SC-24, DEC-33).
// 층 열은 층 사이 선의 최장 경로 깊이로 정하고, 순환은 되돌아가는 선으로 남긴다. 열 안 순서는 앞 열 이웃 자리의 평균(barycenter)을 두 번 돌린다.

// 같은 깊이·같은 부품의 층을 가르는 종류 순서. 층 id 는 프로젝트가 선언하므로 종류로 정한다
export const LANE_ORDER = ['screen', 'code', 'api', 'auth', 'function', 'table'];
// 종류 층은 엔진이 만든 것이라 이름이 id 와 같다. 화면에서는 사람 말로 읽는다
const KIND_NAME = { screen: '화면 경로', api: 'API', auth: '로그인', function: 'DB 함수', table: '테이블' };
/** 층의 화면 이름. 선언한 층은 사람이 준 이름 그대로, 엔진이 만든 종류 층은 사람 말로 */
export const laneName = (l) => (!l ? '' : l.name && l.name !== l.id ? l.name : KIND_NAME[l.kind] ?? l.name ?? l.id);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byKey = (k) => (a, b) => { const x = k(a), y = k(b); for (let i = 0; i < x.length; i++) { const d = typeof x[i] === 'number' ? x[i] - y[i] : cmp(x[i], y[i]); if (d) return d; } return 0; };

// 층 요약(두 줄 격자)
const S = { w: 148, h: 62, gapX: 30, gapY: 68, pad: 14 };
// 층 배치(열 = 층)
const N = { w: 176, h: 38, gapX: 56, gapY: 12, pad: 14, head: 34 };
// 묶음 개요(구역 안 격자)
const Z = { w: 124, h: 56, gap: 12, pad: 14, head: 24, gapY: 16, width: 940 };
// 시스템 그림
const Y = { w: 190, h: 78, gap: 18, pad: 16, head: 26, gapX: 34 };

/** `module:web/x.ts` · `screen:/pay` 처럼 붙은 종류 접두를 뗀 알맹이. 접두가 없으면 그대로 */
export const bare = (id) => (typeof id === 'string' && id.startsWith('module:') ? id.slice(7) : id);
const kindOf = (id) => { const i = String(id).indexOf(':'); return i < 0 ? 'module' : String(id).slice(0, i); };
/** 심볼 좌표(`symbol:<파일>:<이름>`)가 가리키는 파일. 파일 수준에서는 심볼을 그 파일로 접는다 */
export const moduleOfSymbol = (id) => {
  if (typeof id !== 'string' || !id.startsWith('symbol:')) return null;
  const rest = id.slice(7), i = rest.lastIndexOf(':');
  return i < 0 ? rest : rest.slice(0, i);
};

// ---- 층 순서 ----

/** 보이는 층과 그 열 번호. 열은 층 사이 선의 최장 경로 깊이이고, 순환을 만나면 그 선은 깊이에 보태지 않는다. */
export function laneColumns(arch, opts = {}) {
  const hidden = new Set(opts.hidden || []);
  const containers = arch?.containers || [];
  const ci = new Map(containers.map((c, i) => [c.id, i]));
  const all = (arch?.lanes || []).filter((l) => l.visible !== false && !hidden.has(l.id));
  const rank = (l) => [ci.has(l.container) ? ci.get(l.container) : containers.length, LANE_ORDER.indexOf(l.kind) < 0 ? LANE_ORDER.length : LANE_ORDER.indexOf(l.kind), l.id];
  const lanes = [...all].sort(byKey(rank));
  const ids = new Set(lanes.map((l) => l.id));
  const links = (arch?.laneLinks || []).filter((e) => ids.has(e.from) && ids.has(e.to));
  const into = new Map(lanes.map((l) => [l.id, []]));
  for (const e of links) into.get(e.to).push(e.from);

  const depth = new Map(), state = new Map();
  const walk = (id) => {
    if (state.get(id) === 2) return depth.get(id);
    if (state.get(id) === 1) return -1; // 순환: 되돌아가는 선은 깊이에 보태지 않는다
    state.set(id, 1);
    let m = 0;
    for (const f of into.get(id)) m = Math.max(m, walk(f) + 1);
    state.set(id, 2); depth.set(id, m);
    return m;
  };
  for (const l of lanes) walk(l.id);

  const maxD = Math.max(0, ...lanes.map((l) => depth.get(l.id)));
  const columns = Array.from({ length: maxD + 1 }, (_, index) => ({ index, lanes: [], nodes: [] }));
  for (const l of lanes) columns[depth.get(l.id)].lanes.push(l.id);
  return { lanes, columns, depth, links, byId: new Map(lanes.map((l) => [l.id, l])) };
}

/** 층 사이 선: 보이는 층끼리는 선으로, 숨긴 층으로 가는 것은 층마다 수(hiddenN)로만 남긴다(스펙 「화면 모델」). */
function laneLines(arch, L) {
  const ids = new Set(L.lanes.map((l) => l.id));
  const hiddenN = new Map(L.lanes.map((l) => [l.id, 0]));
  const lines = [];
  for (const e of arch?.laneLinks || []) {
    const a = ids.has(e.from), b = ids.has(e.to);
    if (a && b) lines.push({ from: e.from, to: e.to, n: e.n, back: L.depth.get(e.to) <= L.depth.get(e.from) });
    else if (a) hiddenN.set(e.from, hiddenN.get(e.from) + e.n);
    else if (b) hiddenN.set(e.to, hiddenN.get(e.to) + e.n);
  }
  return { lines, hiddenN };
}

// ---- 노드 범위 ----

/** 모듈의 층: 선언한 층이 없으면 부품 이름과 같은 층(부품 하나가 층 하나인 선언)을 쓴다. 그것도 없으면 미배정 */
function moduleLane(m, laneById) {
  if (m.lane && laneById.has(m.lane)) return m.lane;
  if (m.lane) return null;
  return laneById.has(m.container) ? m.container : null;
}

/** 종류 접두가 붙은 노드의 층: 같은 종류의 층 하나에 건다(screen·api·auth·function·table) */
function nodeLane(id, L) {
  const k = kindOf(id);
  if (k === 'module') return null;
  const lane = L.lanes.find((l) => l.kind === k);
  return lane ? lane.id : null;
}

/** 층이 실은 노드 목록(2.1.0 `lanes[].members`). 그 층의 노드 수는 `lanes[].nodes` 숫자가 따로 들고 있다.
 *  엔진이 아직 안 싣는 옛 자료에서는 빈 목록이고, 그 층은 층 배치에서 빈 채로 남는다 */
export function laneMembers(arch) {
  const out = new Map();
  for (const l of arch?.lanes || []) {
    for (const m of Array.isArray(l.members) ? l.members : []) {
      if (!m?.id) continue;
      out.set(bare(m.id), { id: bare(m.id), raw: m.id, lane: l.id, kind: m.kind ?? kindOf(m.id), label: m.label ?? bare(m.id), community: m.community ?? null, part: m.part ?? null });
    }
  }
  return out;
}

/** 함수 수준 자료(`map/.out/architecture.json`)의 심볼을 파일별로 모은다.
 *  `symbols[].module` 이 파일 수준 노드 id 와 같은 공간이고 그것이 두 수준을 잇는 열쇠다.
 *  자료가 없거나 심볼이 0개면 빈 Map 이라 부르는 쪽이 파일 수준에 머문다 */
export function symbolsByModule(fn) {
  const out = new Map();
  for (const sy of Array.isArray(fn?.symbols) ? fn.symbols : []) {
    if (!sy?.id || !sy.module) continue;
    if (!out.has(sy.module)) out.set(sy.module, []);
    out.get(sy.module).push({ id: sy.id, module: sy.module, line: sy.line ?? null, callable: sy.callable !== false, community: sy.community ?? null });
  }
  for (const list of out.values()) list.sort(byKey((x) => [x.line ?? 0, x.id]));
  return out;
}
/** 심볼 엣지의 끝점에는 `symbol:` 접두가 붙어 있고 `symbols[].id` 에는 없다(엔진 실측). 접두를 떼어 맞춘다 */
const bareSymbol = (id) => (typeof id === 'string' && id.startsWith('symbol:') ? id.slice(7) : id);

/** 기능의 실측 선(2.1.0 `flows[].edges`). 없는 자료에서는 빈 목록이고 선언 좌표 사슬만 그린다 */
export function flowEdges(arch, flowId) {
  const f = (arch?.flows || []).find((x) => x.id === flowId);
  return (Array.isArray(f?.edges) ? f.edges : []).filter((e) => e?.from && e?.to);
}

/** 심볼의 1홉 이웃. 심볼은 `arch.modules[].deps`(파일 사이 import)에 없으므로 심볼 사이 엣지에서 찾는다.
 *  `architecture.json` 의 `edges[]` 는 끝점에 `symbol:` 접두가 붙고 `symbols[].id` 에는 안 붙는다 */
export function symbolNeighbors(fn, symbolId) {
  const into = [], out = [];
  for (const e of Array.isArray(fn?.edges) ? fn.edges : []) {
    const a = bareSymbol(e?.from), b = bareSymbol(e?.to);
    if (b === symbolId && a !== symbolId) into.push(a);
    if (a === symbolId && b !== symbolId) out.push(b);
  }
  return { in: [...new Set(into)].sort(cmp), out: [...new Set(out)].sort(cmp) };
}

/** 초점이 고르는 노드 집합. 초점은 sys · part:<부품> · community:<id> · group:<층> · 파일 · 함수 여섯 단계다.
 *  모듈(파일)과 층이 실은 노드를 함께 센다. 여섯째 단계(함수)는 fn 을 받았을 때만 서고,
 *  fn 이 없으면 앞 다섯 단계가 한 글자도 바뀌지 않는다 */
export function focusScope(arch, focus, L, fn = null) {
  const laneById = L.byId;
  const mods = (arch?.modules || []).filter((m) => moduleLane(m, laneById) !== null || m.container);
  const mem = [...laneMembers(arch).values()].filter((x) => laneById.has(x.lane));
  const f = String(focus || 'sys');
  if (f === 'sys') return [...mods.map((m) => m.id), ...mem.map((x) => x.id)];
  if (f.startsWith('part:')) { const id = f.slice(5); return [...mods.filter((m) => m.container === id).map((m) => m.id), ...mem.filter((x) => x.part === id).map((x) => x.id)]; }
  if (f.startsWith('community:')) { const id = Number(f.slice(10)); return [...mods.filter((m) => m.community === id).map((m) => m.id), ...mem.filter((x) => x.community === id).map((x) => x.id)]; }
  if (f.startsWith('group:')) { const id = f.slice(6); return [...mods.filter((m) => moduleLane(m, laneById) === id).map((m) => m.id), ...mem.filter((x) => x.lane === id).map((x) => x.id)]; }
  const id = bare(f);
  // 여섯째 단계: 심볼 초점. 파일 초점과 같은 모양으로 [자기, 들어오는 것, 나가는 것] 을 돌려준다
  if (isSymbolId(fn, id)) {
    const n = symbolNeighbors(fn, id);
    return [id, ...n.in, ...n.out];
  }
  const n = neighbors(arch, id);
  return [id, ...n.in, ...n.out];
}

/** 그 id 가 함수 수준 자료에 있는 심볼인가 */
export const isSymbolId = (fn, id) => (Array.isArray(fn?.symbols) ? fn.symbols : []).some((sy) => sy?.id === id);

// ---- 층 배치 ----

/**
 * 층 요약과 층 배치. opts.mode 가 'nodes' 면 층 배치이고 기본은 층 요약이다.
 * opts: { mode, focus, flow, hidden(층 id), hubMin(기본 8), width }
 * 반환 { mode, boxes: [{id,x,y,w,h,...}], lines: [{from,to,n,...}], columns, W, H }
 */
export function laneLayout(arch, opts = {}) {
  const L = laneColumns(arch, opts);
  const { lines: llines, hiddenN } = laneLines(arch, L);
  if (opts.mode !== 'nodes') {
    const order = L.columns.flatMap((c) => c.lanes);
    const cols = Math.max(1, Math.ceil(order.length / 2));
    const boxes = order.map((id, i) => {
      const l = L.byId.get(id);
      return {
        id, name: laneName(l), kind: l.kind, container: l.container, n: l.nodes, hiddenN: hiddenN.get(id) || 0,
        row: Math.floor(i / cols), col: i % cols,
        x: S.pad + (i % cols) * (S.w + S.gapX), y: S.pad + Math.floor(i / cols) * (S.h + S.gapY), w: S.w, h: S.h,
      };
    });
    const rows = Math.max(1, Math.ceil(order.length / cols));
    return {
      mode: 'summary', boxes, lines: llines, columns: L.columns,
      W: S.pad * 2 + cols * S.w + (cols - 1) * S.gapX, H: S.pad * 2 + rows * S.h + (rows - 1) * S.gapY,
    };
  }

  const laneById = L.byId;
  const modById = new Map((arch?.modules || []).map((m) => [m.id, m]));
  const memById = laneMembers(arch);
  const flow = opts.flow ? (arch?.flows || []).find((x) => x.id === opts.flow) : null;
  const flowSet = flow ? new Set(flow.nodes.map(bare)) : null;
  let ids;
  if (flow && (!opts.focus || opts.focus === 'sys')) ids = flow.nodes.map(bare);
  else {
    ids = focusScope(arch, opts.focus, L, opts.fn || null);
    if (flowSet) ids = ids.filter((x) => flowSet.has(x)); // 기능이 있으면 교집합만(스펙 「화면 모델」)
  }
  ids = [...new Set(ids)].sort(cmp);

  // 층: 파일은 선언한 층, 층이 실은 노드는 그 층, 그 밖은 종류가 같은 층
  // 함수 수준(P5-15b, SC-8): 보이는 파일을 그 파일의 심볼로 펼친다. 심볼이 없는 파일은 파일 상자 그대로 둔다.
  // fn 을 주지 않으면 아래 pieces 가 비어 파일 수준 배치가 한 글자도 바뀌지 않는다
  const symByMod = opts.fn ? symbolsByModule(opts.fn) : new Map();
  const symById = new Map();
  for (const list of symByMod.values()) for (const sy of list) symById.set(sy.id, sy);
  const level = symById.size ? 'fn' : 'file';

  const laneOf = (id) => {
    const m = modById.get(id);
    if (m) return moduleLane(m, laneById);
    const sy = symById.get(id);
    if (sy) { const om = modById.get(sy.module); if (om) return moduleLane(om, laneById); }
    const x = memById.get(id);
    if (x && laneById.has(x.lane)) return x.lane;
    return nodeLane(id, L);
  };
  let shown = ids.filter((id) => { const l = laneOf(id); return l === null ? !!modById.get(id) : laneById.has(l); });
  // 파일 → 심볼 펼치기. 어느 파일이 어떤 심볼로 갈렸는지 남겨 두어 선을 옮길 때 쓴다
  const expandedOf = new Map();
  if (level === 'fn') {
    shown = shown.flatMap((id) => {
      const list = modById.get(id) ? symByMod.get(id) : null;
      if (!list || !list.length) return [id];
      expandedOf.set(id, list.map((sy) => sy.id));
      return list.map((sy) => sy.id);
    });
  }
  const colOf = new Map();
  const colIndex = (lane) => (lane === null ? L.columns.length : L.columns.findIndex((c) => c.lanes.includes(lane)));
  for (const id of shown) colOf.set(id, colIndex(laneOf(id)));

  // 열 = 보이는 층 전부(노드가 없어도 자리를 지킨다) + 층 없는 노드의 마지막 열
  const colX = (i) => N.pad + i * (N.w + N.gapX);
  const columns = L.columns.map((c) => ({ index: c.index, lanes: [...c.lanes], names: c.lanes.map((x) => laneName(laneById.get(x))), ids: [], x: colX(c.index), w: N.w }));
  const loose = shown.filter((id) => colOf.get(id) === L.columns.length);
  if (loose.length) columns.push({ index: L.columns.length, lanes: [], names: ['미배정'], unassigned: true, ids: [], x: colX(L.columns.length), w: N.w });
  for (const id of shown) columns[colOf.get(id)].ids.push(id);
  for (const c of columns) c.ids.sort(cmp);

  // 선: 모듈 사이 의존과 기능의 선언 좌표 사슬
  const inScope = new Set(shown);
  let edges = [];
  for (const id of shown) {
    const m = modById.get(id);
    if (!m) continue;
    for (const d of m.deps || []) if (inScope.has(d) && d !== id) edges.push({ from: id, to: d, n: 1, kind: 'imports' });
  }
  // 함수 수준의 선은 심볼 사이 엣지다. 양 끝이 지금 보이는 집합 안에 있는 것만 그린다
  if (level === 'fn') {
    for (const e of Array.isArray(opts.fn?.edges) ? opts.fn.edges : []) {
      const a = bareSymbol(e?.from), b = bareSymbol(e?.to);
      if (!inScope.has(a) || !inScope.has(b) || a === b) continue;
      edges.push({ from: a, to: b, n: 1, kind: 'symbol', relation: e.kind ?? null, confidence: e.confidence ?? null });
    }
  }
  // 기능의 선언 좌표 사슬. 파일 수준에서는 심볼 좌표를 그 파일로 접어 사슬이 끊기지 않게 한다
  //   화폭에 있는 그대로 → (함수 수준이면) 그 파일이 갈린 첫 심볼 → 심볼 좌표를 그 파일로 접기
  const onCanvas = (id) => {
    const b = bare(id);
    if (inScope.has(b)) return b;
    const first = expandedOf.get(b);
    if (first?.length) return first[0];
    const om = moduleOfSymbol(id);
    if (inScope.has(om)) return om;
    const om2 = expandedOf.get(om);
    return om2?.length ? om2[0] : null;
  };
  if (flow) for (const e of flowPath(arch, flow.id).chain) {
    const a = onCanvas(e.from), b = onCanvas(e.to);
    if (a && b && a !== b) edges.push({ from: a, to: b, n: 1, kind: 'flow', declared: true, broken: e.broken });
  }
  // 기능의 실측 선(flows[].edges). 선언 사슬과 종류로 갈라 화면이 다르게 그린다. 끝점이 화폭에 없는 줄은 뺀다
  if (flow) for (const e of flowEdges(arch, flow.id)) {
    const a = onCanvas(e.from), b = onCanvas(e.to);
    if (a && b && a !== b) edges.push({ from: a, to: b, n: 1, kind: 'flowEdge', declared: false, relation: e.kind ?? null });
  }
  edges.sort(byKey((e) => [e.from, e.to, e.kind, e.relation ?? '']));

  // 열 안 순서: 앞 열 이웃 자리의 평균을 두 번 돌린다. 같은 값은 id 순
  const pos = new Map();
  const place = (c) => c.ids.forEach((id, i) => pos.set(id, i));
  columns.forEach(place);
  const left = new Map(shown.map((id) => [id, []])), right = new Map(shown.map((id) => [id, []]));
  for (const e of edges) {
    const a = colOf.get(e.from), b = colOf.get(e.to);
    if (a === b) continue;
    (a < b ? left : right).get(a < b ? e.to : e.from).push(a < b ? e.from : e.to);
    (a < b ? right : left).get(a < b ? e.from : e.to).push(a < b ? e.to : e.from);
  }
  const sweeps = 2;
  const bary = (c, nb) => {
    const v = new Map(c.ids.map((id) => { const ns = nb.get(id); return [id, ns.length ? ns.reduce((t, x) => t + pos.get(x), 0) / ns.length : pos.get(id)]; }));
    c.ids.sort((a, b) => v.get(a) - v.get(b) || cmp(a, b));
    place(c);
  };
  for (let r = 0; r < sweeps; r++) {
    for (let i = 1; i < columns.length; i++) bary(columns[i], left);
    for (let i = columns.length - 2; i >= 0; i--) bary(columns[i], right);
  }

  // 허브 들어오는 선 묶기: 들어오는 선이 hubMin 이상인 노드는 앞 열마다 한 가닥으로 묶는다. 묶은 선은 초점을 옮기지 않는다
  const hubMin = opts.hubMin ?? 8;
  const indeg = new Map(shown.map((id) => [id, 0]));
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const lines = [];
  const doneHub = new Set();
  for (const e of edges) {
    if (indeg.get(e.to) < hubMin) { lines.push({ ...e, bundled: false, focusable: true }); continue; }
    const key = `${e.to}|${colOf.get(e.from)}`;
    if (doneHub.has(key)) continue;
    doneHub.add(key);
    const group = edges.filter((x) => x.to === e.to && colOf.get(x.from) === colOf.get(e.from));
    if (group.length < 2) { lines.push({ ...e, bundled: false, focusable: true }); continue; }
    lines.push({ from: group[0].from, to: e.to, n: group.length, kind: 'bundle', bundled: true, focusable: false, members: group.map((x) => x.from), column: colOf.get(e.from) });
  }

  // 묶음 단위 접기: 한 열이 foldMax 를 넘으면 그 열을 묶음 상자로 접는다(DEC-33 접기 규칙).
  // 접은 상자를 누르면 그 묶음으로 가고, 무엇이 접혔는지는 members 와 화면 칩이 적는다
  const foldMax = opts.foldMax ?? 40;
  const communityOf = (id) => modById.get(id)?.community ?? symById.get(id)?.community ?? memById.get(id)?.community ?? null;
  const communityNameOf = (id) => modById.get(id)?.communityName ?? (communityOf(id) == null ? null : (arch?.communities || []).find((c) => c.id === communityOf(id))?.name ?? String(communityOf(id)));
  const foldedIn = new Map(); // 접힌 노드 id → 접은 상자 id
  let folded = 0;
  for (const c of columns) {
    if (c.ids.length <= foldMax) continue;
    const groups = foldByCommunity(c.ids.map((id) => ({ id, community: communityOf(id), communityName: communityNameOf(id) })));
    // 묶음이 하나뿐이면 접지 않는다. 상자 하나 뒤에 열 전체가 숨고, 그 상자를 눌러 그 묶음으로 가도 같은 열이 다시 접혀 빠져나갈 자리가 없다
    if (groups.length < 2) continue;
    folded += c.ids.length;
    c.foldedFrom = c.ids.length;
    c.ids = groups.map((g) => {
      const boxId = `fold:${c.lanes[0] ?? c.index}:${g.community ?? '-'}`;
      for (const x of g.ids) foldedIn.set(x, boxId);
      c.folds = [...(c.folds || []), { id: boxId, community: g.community, name: g.name, n: g.n, members: g.ids }];
      return boxId;
    });
  }
  const foldById = new Map(columns.flatMap((c) => (c.folds || []).map((f) => [f.id, f])));
  // 접힌 노드로 가는 선은 접은 상자로 옮기고 같은 짝은 한 줄로 모은다
  const at = (id) => foldedIn.get(id) ?? id;
  let drawn = lines;
  if (foldById.size) {
    const seen = new Map();
    for (const l of lines) {
      const a = at(l.from), b = at(l.to);
      if (a === b) continue;
      const k = `${a}>${b}|${l.kind}`;
      const cur = seen.get(k);
      if (cur) { cur.n += l.n; continue; }
      seen.set(k, { ...l, from: a, to: b, members: l.members ? l.members.map(at) : undefined });
    }
    drawn = [...seen.values()];
  }

  const rows = Math.max(1, ...columns.map((c) => c.ids.length));
  const boxes = [];
  columns.forEach((c) => c.ids.forEach((id, row) => {
    const m = modById.get(id), x = memById.get(id), f = foldById.get(id);
    const pos = { x: colX(c.index), y: N.head + N.pad + row * (N.h + N.gapY), w: N.w, h: N.h };
    if (f) {
      boxes.push({
        id, row, column: c.index, lane: c.lanes[0] ?? null, kind: 'fold', folded: true,
        name: f.name, n: f.n, members: f.members, community: f.community,
        communityName: f.community == null ? null : f.name, symbols: null, violations: [],
        focusTo: f.community == null ? null : `community:${f.community}`,
        onFlow: flowSet ? f.members.some((y) => flowSet.has(y)) : false, ...pos,
      });
      return;
    }
    const sy = m ? null : symById.get(id);
    const syMod = sy ? modById.get(sy.module) : null;
    boxes.push({
      id, row, column: c.index, lane: laneOf(id), kind: m ? 'module' : sy ? 'symbol' : x ? x.kind : kindOf(id), folded: false,
      name: m ? id.split('/').pop() : sy ? sy.id.slice(sy.module.length + 1) : x ? x.label : String(id).slice(String(id).indexOf(':') + 1),
      community: m ? m.community : sy ? sy.community : x ? x.community : null,
      communityName: m ? m.communityName : sy ? syMod?.communityName ?? communityNameOf(id) : x ? communityNameOf(id) : null,
      container: m ? m.container ?? null : sy ? syMod?.container ?? null : x ? x.part : null,
      ...(sy ? { module: sy.module, line: sy.line } : {}),
      symbols: m ? m.symbols : null, violations: m ? m.violations || [] : [],
      onFlow: flowSet ? flowSet.has(id) || (sy ? flowSet.has(sy.module) : false) : false, ...pos,
    });
  }));
  // 심볼 초점인데 이웃이 하나도 없는 자리. 상자 하나가 맞는 답이지만 화면이 까닭을 적어야 막다른 길로 안 보인다
  const lonelySymbol = isSymbolId(opts.fn, bare(String(opts.focus || ''))) && boxes.length === 1 && !drawn.length;
  return {
    mode: 'nodes', level, boxes, lines: drawn, columns, sweeps, hiddenN, folded, lonelySymbol,
    W: N.pad * 2 + columns.length * N.w + Math.max(0, columns.length - 1) * N.gapX,
    H: N.head + N.pad * 2 + rows * N.h + Math.max(0, rows - 1) * N.gapY,
  };
}

// ---- 묶음 개요 ----

/**
 * 묶음 상자를 구역 안에 격자로 둔다. 구역은 부품 선언 순서, 구역 안은 묶음 id 순이다(힘 배치를 쓰지 않는다).
 * opts: { hideTests(기본 거짓), hidden(묶음 id), edges: 'directed'|'pair', thin(드문 선 숨김), width }
 * 기본값은 자료가 보이라고 한 묶음(visible)을 모두 그린다. 검사 묶음 기본 숨김은 화면이 hideTests 로 건다(스펙 「화면 모델」).
 * thin 은 짝별 건수의 중위값을 문턱으로 그보다 드문 선을 숨긴다(OQ-11 결정 focus). 문턱은 자료가 정하고 코드에 고정하지 않는다
 * 반환 { zones, boxes, lines, hidden, W, H }
 */
export function communityLayout(arch, opts = {}) {
  const width = opts.width ?? Z.width;
  const off = new Set(opts.hidden || []);
  const containers = arch?.containers || [];
  const zi = new Map(containers.map((c, i) => [c.id, i]));
  const all = arch?.communities || [];
  // 검사 묶음: 구역을 셀 부품이 없어 zone 이 비는 묶음이다(표본에서 그대로 검사 폴더에서 온 묶음이었다)
  const isTest = (c) => c.zone == null;
  const vis = all.filter((c) => c.visible !== false && !off.has(c.id) && !(opts.hideTests && isTest(c)));
  const hidden = all.filter((c) => !vis.includes(c));
  const zoneId = (c) => (c.zone == null ? '' : c.zone);
  const zoneRank = (z) => (z === '' ? containers.length + 1 : zi.has(z) ? zi.get(z) : containers.length);
  const zoneIds = [...new Set(vis.map(zoneId))].sort(byKey((z) => [zoneRank(z), z]));

  const perRow = Math.max(1, Math.floor((width - Z.pad * 2 - Z.pad * 2 + Z.gap) / (Z.w + Z.gap)));
  const zones = [], boxes = [];
  let y = Z.pad;
  for (const z of zoneIds) {
    const list = vis.filter((c) => zoneId(c) === z).sort((a, b) => a.id - b.id);
    const rows = Math.max(1, Math.ceil(list.length / perRow));
    const cols = Math.min(perRow, list.length);
    const zw = Z.pad * 2 + cols * Z.w + (cols - 1) * Z.gap;
    const zh = Z.head + Z.pad * 2 + rows * Z.h + (rows - 1) * Z.gap;
    const c = containers.find((x) => x.id === z);
    zones.push({ id: z, name: z === '' ? '구역 없음' : c ? c.name : z, x: Z.pad, y, w: zw, h: zh, n: list.length });
    list.forEach((cm, i) => {
      const r = Math.floor(i / perRow), q = i % perRow;
      boxes.push({
        id: cm.id, name: cm.name, zone: z, n: cm.nodes, lanes: cm.lanes || [], inherited: cm.inherited || 0, hiddenN: 0,
        x: Z.pad + Z.pad + q * (Z.w + Z.gap), y: y + Z.head + Z.pad + r * (Z.h + Z.gap), w: Z.w, h: Z.h,
      });
    });
    y += zh + Z.gapY;
  }

  const shown = new Set(vis.map((c) => c.id));
  const hiddenN = new Map(vis.map((c) => [c.id, 0]));
  const kept = [];
  for (const e of arch?.communityLinks || []) {
    const a = shown.has(e.from), b = shown.has(e.to);
    if (a && b) kept.push(e);
    else if (a) hiddenN.set(e.from, hiddenN.get(e.from) + e.n);
    else if (b) hiddenN.set(e.to, hiddenN.get(e.to) + e.n);
  }
  for (const b of boxes) b.hiddenN = hiddenN.get(b.id) || 0;

  let lines;
  if (opts.edges === 'pair') {
    const m = new Map();
    for (const e of kept) {
      const lo = Math.min(e.from, e.to), hi = Math.max(e.from, e.to), k = `${lo}|${hi}`;
      const cur = m.get(k) || { from: lo, to: hi, n: 0, kinds: {}, both: false, dirs: new Set() };
      cur.n += e.n;
      for (const [kk, v] of Object.entries(e.kinds || {})) cur.kinds[kk] = (cur.kinds[kk] || 0) + v;
      cur.dirs.add(`${e.from}>${e.to}`);
      cur.both = cur.dirs.size > 1;
      m.set(k, cur);
    }
    lines = [...m.values()].map(({ dirs, ...x }) => x).sort(byKey((e) => [e.from, e.to]));
  } else {
    lines = kept.map((e) => ({ from: e.from, to: e.to, n: e.n, kinds: e.kinds || {}, both: false })).sort(byKey((e) => [e.from, e.to]));
  }

  // 드문 선 숨김: 문턱은 짝별 건수의 중위값이다. 숨긴 수는 바닥 칩이 적는다
  const ns = lines.map((l) => l.n).sort((a, b) => a - b);
  const cut = opts.thin && ns.length ? ns[Math.floor(ns.length / 2)] : 0;
  const shownLines = cut ? lines.filter((l) => l.n >= cut) : lines;

  const W = Math.max(width, ...zones.map((z) => z.x + z.w + Z.pad));
  return {
    zones, boxes, lines: shownLines, allLines: lines, cut, thinHidden: lines.length - shownLines.length,
    hidden: hidden.map((c) => c.id).sort((a, b) => a - b), W, H: Math.max(Z.pad * 2, y - Z.gapY + Z.pad),
  };
}

/** 선 교차 수: 상자 가운데를 잇는 선분끼리 실제로 엇갈리는 짝을 센다(그림이 읽히는지 재는 값) */
export function crossings(boxes, lines) {
  const at = new Map(boxes.map((b) => [b.id, [b.x + b.w / 2, b.y + b.h / 2]]));
  const segs = lines.map((l) => [at.get(l.from), at.get(l.to)]).filter(([a, b]) => a && b);
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [a, b] = segs[i], [c, d] = segs[j];
    if (a === c || a === d || b === c || b === d) continue;
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) n++;
  }
  return n;
}

// ---- 길·이웃·접기 ----

/** 기능 하나의 길: 층별 노드 목록과 선언 좌표 사슬, 끊긴 자리. 없는 기능이면 null */
export function flowPath(arch, flowId) {
  const f = (arch?.flows || []).find((x) => x.id === flowId);
  if (!f) return null;
  const L = laneColumns(arch, {});
  const modById = new Map((arch?.modules || []).map((m) => [m.id, m]));
  const memById = laneMembers(arch);
  const laneOf = (id) => {
    const m = modById.get(bare(id));
    if (m) return moduleLane(m, L.byId);
    const x = memById.get(bare(id));
    if (x && L.byId.has(x.lane)) return x.lane;
    return nodeLane(id, L);
  };
  const order = L.columns.flatMap((c) => c.lanes);
  const groups = new Map();
  for (const raw of f.nodes || []) {
    const lane = laneOf(raw) ?? '';
    if (!groups.has(lane)) groups.set(lane, []);
    const id = bare(raw), mem = memById.get(id);
    // 화면에 적을 이름: 파일은 경로 그대로, 그 밖은 층이 실은 label(없으면 종류 접두를 뗀 알맹이)
    const label = modById.get(id) ? id : mem?.label ?? String(id).slice(String(id).indexOf(':') + 1);
    groups.get(lane).push({ id, raw, kind: kindOf(raw), label, module: modById.get(id) || null });
  }
  const byLane = [...order, ''].filter((l) => groups.has(l)).map((lane) => ({
    lane, name: laneName(L.byId.get(lane)) || '미배정', nodes: groups.get(lane).sort(byKey((x) => [x.id])),
  }));
  const path = f.path || [];
  const isBroken = (i) => (f.broken || []).some((b) => b?.at === i || (b?.from === path[i]?.node && b?.to === path[i + 1]?.node) || b?.node === path[i + 1]?.node || b?.ref === path[i + 1]?.ref);
  const chain = path.slice(0, -1).map((p, i) => ({ from: p.node, to: path[i + 1].node, fromRef: p.ref, toRef: path[i + 1].ref, kind: path[i + 1].kind, broken: isBroken(i) }));
  return { id: f.id, name: f.name, status: f.status, container: f.container ?? null, step: f.step ?? null, story: f.story ?? '', counts: f.counts || {}, broken: f.broken || [], nodes: (f.nodes || []).map(bare), path, byLane, chain };
}

/** 노드의 1홉 이웃: 들어오는 호출과 나가는 호출, 층·부품·묶음·위반·지나는 기능.
 *  파일은 modules[].deps 로, 그 밖의 노드는 기능의 실측 선(flows[].edges)으로 이웃을 찾는다 */
export function neighbors(arch, nodeId, fn = null) {
  const id = bare(nodeId);
  const mods = arch?.modules || [];
  // 여섯째 단계(함수): 심볼의 이웃은 심볼 사이 엣지에서 읽는다. 층·부품·묶음은 그 심볼이 속한 파일에서 온다.
  // 그림과 같은 자료를 봐야 패널이 "호출 0" 이라고 말하면서 그림이 선을 긋는 어긋남이 안 생긴다
  if (isSymbolId(fn, id)) {
    const sy = fn.symbols.find((x) => x.id === id);
    const om = mods.find((x) => x.id === sy.module) || null;
    const sn = symbolNeighbors(fn, id);
    return {
      id, symbol: true, module: sy.module, line: sy.line ?? null,
      lane: om?.lane ?? null, container: om?.container ?? null,
      community: sy.community ?? om?.community ?? null, communityName: om?.communityName ?? null,
      in: sn.in, out: sn.out, violations: [],
      flows: (arch?.flows || []).filter((f) => (f.nodes || []).some((x) => bare(x) === sy.module)).map((f) => f.id),
    };
  }
  const m = mods.find((x) => x.id === id) || null;
  const flows = (arch?.flows || []).filter((f) => (f.nodes || []).some((x) => bare(x) === id)).map((f) => f.id);
  const mem = laneMembers(arch).get(id) || null;
  // 기능의 실측 선은 파일 밖 노드(화면 경로·API·로그인·DB 함수·테이블)의 유일한 이웃 자료다
  const fin = [], fout = [];
  for (const f of arch?.flows || []) for (const e of Array.isArray(f.edges) ? f.edges : []) {
    if (bare(e.to) === id) fin.push(bare(e.from));
    if (bare(e.from) === id) fout.push(bare(e.to));
  }
  const uniq = (xs) => [...new Set(xs)].sort(cmp);
  if (!m) {
    return {
      id, lane: mem?.lane ?? null, container: mem?.part ?? null, community: mem?.community ?? null, communityName: null,
      in: uniq(fin), out: uniq(fout), violations: [], flows,
    };
  }
  return {
    id, lane: m.lane ?? null, container: m.container ?? null, community: m.community ?? null, communityName: m.communityName ?? null,
    in: uniq([...mods.filter((x) => (x.deps || []).includes(id)).map((x) => x.id), ...fin]),
    out: uniq([...(m.deps || []), ...fout]),
    violations: m.violations || [], flows,
  };
}

/** 노드를 묶음 단위로 접는다. 묶음 id 순이고 묶음 없는 노드는 마지막 한 묶음이다(함수 수준에서 수백 개가 될 때 쓴다) */
export function foldByCommunity(nodes = []) {
  const groups = new Map();
  for (const n of nodes) {
    const k = n.community ?? null;
    if (!groups.has(k)) groups.set(k, { community: k, name: k == null ? '묶음 없음' : n.communityName ?? String(k), ids: [], n: 0 });
    const g = groups.get(k);
    g.ids.push(n.id); g.n += 1;
  }
  return [...groups.values()].map((g) => ({ ...g, ids: g.ids.sort(cmp) })).sort(byKey((g) => [g.community == null ? Infinity : g.community]));
}

// ---- 시스템 그림 ----

/**
 * 경계 안에 부품 상자를 두고 실측 건수로 잇는다. 경계는 선언 그림이 준 순서, 경계 안은 부품 선언 순서다.
 * 선의 건수는 층 사이 선을 부품 짝으로 모은 값이고, 선언만 있고 실측이 없는 짝은 declaredOnly 다.
 */
export function systemLayout(arch, opts = {}) {
  const containers = arch?.containers || [];
  const declared = arch?.declaration?.diagram?.boundaries || [];
  const order = declared.map((b) => b.id);
  const ids = [...new Set([...order, ...containers.map((c) => c.boundary ?? '')])].filter((b) => containers.some((c) => (c.boundary ?? '') === b));
  const laneC = new Map((arch?.lanes || []).map((l) => [l.id, l.container]));
  const pair = new Map();
  for (const e of arch?.laneLinks || []) {
    const a = laneC.get(e.from), b = laneC.get(e.to);
    if (!a || !b || a === b) continue;
    const k = `${a}>${b}`;
    pair.set(k, (pair.get(k) || 0) + e.n);
  }
  const boxes = [], zones = [];
  let x = Y.pad;
  for (const b of ids) {
    const list = containers.filter((c) => (c.boundary ?? '') === b);
    const zw = Y.pad * 2 + Y.w;
    const zh = Y.head + Y.pad * 2 + list.length * Y.h + (list.length - 1) * Y.gap;
    const label = declared.find((d) => d.id === b)?.label ?? b;
    zones.push({ id: b, name: label || '경계 없음', x, y: Y.pad, w: zw, h: zh, n: list.length });
    list.forEach((c, i) => boxes.push({
      id: c.id, name: c.name, kind: c.kind, boundary: b, counts: c.counts || {}, deps: c.deps || [], flows: c.flows || 0, src: c.src || null,
      x: x + Y.pad, y: Y.pad + Y.head + Y.pad + i * (Y.h + Y.gap), w: Y.w, h: Y.h,
    }));
    x += zw + Y.gapX;
  }
  const at = new Map(boxes.map((b) => [b.id, b]));
  const lines = [];
  const seen = new Set();
  for (const c of containers) for (const d of c.deps || []) {
    if (!at.has(c.id) || !at.has(d)) continue;
    const k = `${c.id}>${d}`; if (seen.has(k)) continue; seen.add(k);
    lines.push({ from: c.id, to: d, n: pair.get(k) || 0, declaredOnly: !pair.get(k) });
  }
  for (const [k, n] of pair) {
    if (seen.has(k)) continue;
    const [from, to] = k.split('>');
    if (!at.has(from) || !at.has(to)) continue;
    seen.add(k);
    lines.push({ from, to, n, declaredOnly: false, undeclared: true });
  }
  lines.sort(byKey((l) => [l.from, l.to]));
  return {
    zones, boxes, lines, actors: opts.actors || [],
    W: Math.max(Y.pad, x - Y.gapX + Y.pad), H: Y.pad * 2 + Math.max(0, ...zones.map((z) => z.h)),
  };
}
