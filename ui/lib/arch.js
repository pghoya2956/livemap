// 구조 화면 배치: 부품·층·묶음·길의 좌표와 선을 계산한다. data.json 의 architecture 절(과 함수 수준일 때 architecture.json)만 받는
// 순수 함수라 JSX 없이 단위 검사가 부른다. 배치는 결정적이다 — 같은 입력이면 같은 좌표이고 힘 배치를 쓰지 않는다(SC-11·SC-24, DEC-33).
// 층 열은 층 사이 선의 최장 경로 깊이로 정하고, 순환은 되돌아가는 선으로 남긴다. 열 안 순서는 앞 열 이웃 자리의 평균(barycenter)을 두 번 돌린다.

// 같은 깊이·같은 부품의 층을 가르는 종류 순서. 층 id 는 프로젝트가 선언하므로 종류로 정한다
export const LANE_ORDER = ['screen', 'code', 'api', 'auth', 'function', 'table'];

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

/** 초점이 고르는 노드 집합. 초점은 sys · part:<부품> · community:<id> · group:<층> · 노드 id 여섯 단계다 */
export function focusScope(arch, focus, L) {
  const laneById = L.byId;
  const mods = (arch?.modules || []).filter((m) => moduleLane(m, laneById) !== null || m.container);
  const f = String(focus || 'sys');
  if (f === 'sys') return mods.map((m) => m.id);
  if (f.startsWith('part:')) { const id = f.slice(5); return mods.filter((m) => m.container === id).map((m) => m.id); }
  if (f.startsWith('community:')) { const id = Number(f.slice(10)); return mods.filter((m) => m.community === id).map((m) => m.id); }
  if (f.startsWith('group:')) { const id = f.slice(6); return mods.filter((m) => moduleLane(m, laneById) === id).map((m) => m.id); }
  const id = bare(f);
  const n = neighbors(arch, id);
  return [id, ...n.in, ...n.out];
}

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
        id, name: l.name, kind: l.kind, container: l.container, n: l.nodes, hiddenN: hiddenN.get(id) || 0,
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
  const flow = opts.flow ? (arch?.flows || []).find((x) => x.id === opts.flow) : null;
  const flowSet = flow ? new Set(flow.nodes.map(bare)) : null;
  let ids;
  if (flow && (!opts.focus || opts.focus === 'sys')) ids = flow.nodes.map(bare);
  else {
    ids = focusScope(arch, opts.focus, L);
    if (flowSet) ids = ids.filter((x) => flowSet.has(x)); // 기능이 있으면 교집합만(스펙 「화면 모델」)
  }
  ids = [...new Set(ids)].sort(cmp);

  const laneOf = (id) => { const m = modById.get(id); return m ? moduleLane(m, laneById) : nodeLane(id, L); };
  const shown = ids.filter((id) => { const l = laneOf(id); return l === null ? !!modById.get(id) : laneById.has(l); });
  const colOf = new Map();
  const colIndex = (lane) => (lane === null ? L.columns.length : L.columns.findIndex((c) => c.lanes.includes(lane)));
  for (const id of shown) colOf.set(id, colIndex(laneOf(id)));

  // 열 = 보이는 층 전부(노드가 없어도 자리를 지킨다) + 층 없는 노드의 마지막 열
  const columns = L.columns.map((c) => ({ index: c.index, lanes: [...c.lanes], names: c.lanes.map((x) => laneById.get(x).name), ids: [] }));
  const loose = shown.filter((id) => colOf.get(id) === L.columns.length);
  if (loose.length) columns.push({ index: L.columns.length, lanes: [], names: ['미배정'], unassigned: true, ids: [] });
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
  if (flow) for (const e of flowPath(arch, flow.id).chain) if (inScope.has(bare(e.from)) && inScope.has(bare(e.to))) edges.push({ from: bare(e.from), to: bare(e.to), n: 1, kind: 'flow', broken: e.broken });
  edges.sort(byKey((e) => [e.from, e.to, e.kind]));

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

  const rows = Math.max(1, ...columns.map((c) => c.ids.length));
  const boxes = [];
  columns.forEach((c) => c.ids.forEach((id, row) => {
    const m = modById.get(id);
    boxes.push({
      id, row, column: c.index, lane: laneOf(id), kind: m ? 'module' : kindOf(id),
      name: m ? id.split('/').pop() : String(id).slice(String(id).indexOf(':') + 1),
      community: m ? m.community : null, communityName: m ? m.communityName : null,
      symbols: m ? m.symbols : null, violations: m ? m.violations || [] : [],
      onFlow: flowSet ? flowSet.has(id) : false,
      x: N.pad + c.index * (N.w + N.gapX), y: N.head + N.pad + row * (N.h + N.gapY), w: N.w, h: N.h,
    });
  }));
  return {
    mode: 'nodes', boxes, lines, columns, sweeps, hiddenN,
    W: N.pad * 2 + columns.length * N.w + Math.max(0, columns.length - 1) * N.gapX,
    H: N.head + N.pad * 2 + rows * N.h + Math.max(0, rows - 1) * N.gapY,
  };
}

// ---- 묶음 개요 ----

/**
 * 묶음 상자를 구역 안에 격자로 둔다. 구역은 부품 선언 순서, 구역 안은 묶음 id 순이다(힘 배치를 쓰지 않는다).
 * opts: { hideTests(기본 거짓), hidden(묶음 id), edges: 'directed'|'pair', width }
 * 기본값은 자료가 보이라고 한 묶음(visible)을 모두 그린다. 검사 묶음 기본 숨김은 화면이 hideTests 로 건다(스펙 「화면 모델」)
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

  const W = Math.max(width, ...zones.map((z) => z.x + z.w + Z.pad));
  return { zones, boxes, lines, hidden: hidden.map((c) => c.id).sort((a, b) => a - b), W, H: Math.max(Z.pad * 2, y - Z.gapY + Z.pad) };
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
  const laneOf = (id) => { const m = modById.get(bare(id)); return m ? moduleLane(m, L.byId) : nodeLane(id, L); };
  const order = L.columns.flatMap((c) => c.lanes);
  const groups = new Map();
  for (const raw of f.nodes || []) {
    const lane = laneOf(raw) ?? '';
    if (!groups.has(lane)) groups.set(lane, []);
    groups.get(lane).push({ id: bare(raw), raw, kind: kindOf(raw), module: modById.get(bare(raw)) || null });
  }
  const byLane = [...order, ''].filter((l) => groups.has(l)).map((lane) => ({
    lane, name: L.byId.get(lane)?.name ?? '미배정', nodes: groups.get(lane).sort(byKey((x) => [x.id])),
  }));
  const path = f.path || [];
  const isBroken = (i) => (f.broken || []).some((b) => b?.at === i || (b?.from === path[i]?.node && b?.to === path[i + 1]?.node) || b?.node === path[i + 1]?.node || b?.ref === path[i + 1]?.ref);
  const chain = path.slice(0, -1).map((p, i) => ({ from: p.node, to: path[i + 1].node, fromRef: p.ref, toRef: path[i + 1].ref, kind: path[i + 1].kind, broken: isBroken(i) }));
  return { id: f.id, name: f.name, status: f.status, container: f.container ?? null, step: f.step ?? null, story: f.story ?? '', counts: f.counts || {}, broken: f.broken || [], nodes: (f.nodes || []).map(bare), path, byLane, chain };
}

/** 노드의 1홉 이웃: 들어오는 호출과 나가는 호출, 층·부품·묶음·위반·지나는 기능 */
export function neighbors(arch, nodeId) {
  const id = bare(nodeId);
  const mods = arch?.modules || [];
  const m = mods.find((x) => x.id === id) || null;
  const flows = (arch?.flows || []).filter((f) => (f.nodes || []).some((x) => bare(x) === id)).map((f) => f.id);
  if (!m) return { id, lane: null, container: null, community: null, communityName: null, in: [], out: [], violations: [], flows };
  return {
    id, lane: m.lane ?? null, container: m.container ?? null, community: m.community ?? null, communityName: m.communityName ?? null,
    in: mods.filter((x) => (x.deps || []).includes(id)).map((x) => x.id),
    out: [...(m.deps || [])],
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
