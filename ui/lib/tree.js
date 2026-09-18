// 로드맵 트리 배치: 항목과 선행에서 열 모드·열·열 안 순서·잠김·더미·순환·우회 차선을 계산하고(buildTree), 고른 항목의 길(pathOf)과 픽셀 기하(geometry)를 낸다.
const STATUS = ['완료', '진행', '다음', '대기', '이후'];
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || cmp(String(a.id), String(b.id));
// 선행은 문자열 id(손으로 만든 자료) 또는 data.json의 { id, title, status } 객체다
const depIds = (it) => [...new Set((it.deps || []).map((d) => (typeof d === 'string' ? d : d?.id)).filter(Boolean))];

/**
 * items: data.roadmap[], milestones: data.milestones[](비면 layer 모드).
 * opts.exhaustiveMax: layer 모드에서 순열 전수 탐색을 돌릴 열 크기 상한(기본 7, 0이면 중심값 정렬만).
 * 반환 { mode, columns, nodes, edges, cyclic, dummies, lanes }
 *   columns[]: { index, kind: 'layer'|'cycle'|'milestone'|'unassigned', msId, label, ids(항목만, 행 순서), slots(더미 포함 행 순서), counts, lanes }
 *   nodes[id]: { column, row, depth(순환 열은 null), locked, blockedByDeps, parents, children }
 *   edges[]:   { id: 'from>to', from, to, span(도착 열 − 출발 열), cyclic, backward, sameColumn, lane(열 안 엣지만), via(더미 id) }
 *   dummies[id]: { column, row, edge } — layer 모드 긴 엣지의 중간 열 꺾임점
 */
export function buildTree(items = [], milestones = [], opts = {}) {
  const exhaustiveMax = opts.exhaustiveMax ?? 7;
  const list = [...(items || [])].sort(byOrder);
  const ms = [...(milestones || [])].sort(byOrder);
  const mode = ms.length ? 'milestone' : 'layer';
  const byId = new Map(list.map((it) => [it.id, it]));
  // 없는 선행 id는 엣지를 만들지 않는다(엔진이 「선행 항목 없음」을 따로 낸다)
  const parents = new Map(list.map((it) => [it.id, depIds(it).filter((d) => byId.has(d))]));
  const children = new Map(list.map((it) => [it.id, []]));
  for (const it of list) for (const d of parents.get(it.id)) children.get(d).push(it.id);

  // 선행 깊이(최장 경로)를 Kahn 위상 정렬로 낸다. 큐를 빠져나오지 못한 항목은 순환이거나 순환 뒤에 선다
  const indeg = new Map(list.map((it) => [it.id, parents.get(it.id).length]));
  const depth = new Map();
  const queue = list.filter((it) => !indeg.get(it.id)).map((it) => it.id);
  for (const id of queue) depth.set(id, 0);
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    for (const v of children.get(u)) {
      depth.set(v, Math.max(depth.get(v) ?? 0, depth.get(u) + 1));
      indeg.set(v, indeg.get(v) - 1);
      if (!indeg.get(v)) queue.push(v);
    }
  }
  const settled = new Set(queue);
  const leftover = list.filter((it) => !settled.has(it.id)).map((it) => it.id);
  for (const id of leftover) depth.set(id, null);
  // 순환에 든 항목: 자기에게 되돌아오는 항목. 남은 항목끼리만 도달을 잰다
  const reach = new Map();
  for (const u of leftover) {
    const seen = new Set();
    const stack = [...children.get(u)];
    while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); stack.push(...children.get(x)); }
    reach.set(u, seen);
  }
  const cyclic = leftover.filter((u) => reach.get(u).has(u));
  const inCycle = (u, v) => settled.has(v) ? false : reach.get(v).has(u);

  // 열: layer는 깊이(+ 순환 열), milestone은 파일 순서의 마일스톤(+ 미배정 열)
  const columns = [];
  const colOf = new Map();
  const addColumn = (kind, msId, label) => { const c = { index: columns.length, kind, msId, label, ids: [], slots: [], counts: {}, lanes: 0 }; columns.push(c); return c; };
  if (mode === 'layer') {
    const maxDepth = Math.max(-1, ...queue.map((id) => depth.get(id)));
    for (let k = 0; k <= maxDepth; k++) addColumn('layer', null, '');
    for (const id of queue) colOf.set(id, depth.get(id));
    if (leftover.length) { const c = addColumn('cycle', null, '순환'); for (const id of leftover) colOf.set(id, c.index); }
  } else {
    const msIdx = new Map();
    for (const m of ms) msIdx.set(m.id, addColumn('milestone', m.id, m.title ?? m.label ?? m.id).index);
    // 목록에 없는 마일스톤 id는 미배정으로 눕힌다(DEC-48: data.json은 그 id를 그대로 남긴다)
    const loose = list.filter((it) => !msIdx.has(it.milestone));
    const un = loose.length ? addColumn('unassigned', null, '마일스톤 없음') : null;
    for (const it of list) colOf.set(it.id, msIdx.get(it.milestone) ?? un.index);
  }

  const edges = [];
  for (const it of list) for (const u of parents.get(it.id)) {
    const span = colOf.get(it.id) - colOf.get(u);
    edges.push({ id: `${u}>${it.id}`, from: u, to: it.id, span, cyclic: inCycle(u, it.id), backward: span < 0, sameColumn: span === 0, lane: null, via: [] });
  }

  // 행 순서의 기준 키: 항목은 order, 더미는 (도착 항목 order, 출발 항목 order)
  const key = new Map(list.map((it) => [it.id, [it.order ?? 0, -Infinity, it.id]]));
  const keyCmp = (a, b) => { const x = key.get(a), y = key.get(b); return x[0] - y[0] || x[1] - y[1] || cmp(x[2], y[2]); };
  const dummies = {};
  for (const it of list) columns[colOf.get(it.id)].slots.push(it.id);
  if (mode === 'layer') {
    for (const e of edges) for (let c = colOf.get(e.from) + 1; c < colOf.get(e.to); c++) {
      const d = `${e.id}#${c}`;
      dummies[d] = { column: c, row: 0, edge: e.id };
      key.set(d, [byId.get(e.to).order ?? 0, byId.get(e.from).order ?? 0, d]);
      e.via.push(d);
      columns[c].slots.push(d);
    }
    for (const c of columns) c.slots.sort(keyCmp);
    orderLayers(columns, edges, keyCmp, exhaustiveMax);
  } else {
    // 열 안은 선행 깊이 오름차순(순환 항목은 맨 아래), 같으면 order
    const dk = (id) => depth.get(id) ?? Infinity;
    for (const c of columns) c.slots.sort((a, b) => dk(a) - dk(b) || keyCmp(a, b));
  }

  const nodes = {};
  columns.forEach((c) => {
    c.ids = c.slots.filter((s) => byId.has(s));
    c.slots.forEach((s, row) => { if (dummies[s]) dummies[s].row = row; });
    const counts = Object.fromEntries(STATUS.map((k) => [k, 0]));
    for (const id of c.ids) { const st = byId.get(id).status ?? ''; counts[st] = (counts[st] ?? 0) + 1; }
    c.counts = counts;
    if (c.kind === 'layer') c.label = Object.keys(counts).filter((k) => counts[k]).map((k) => `${k} ${counts[k]}`).join(' · ');
  });
  for (const it of list) {
    const column = colOf.get(it.id);
    const blockedByDeps = parents.get(it.id).filter((d) => byId.get(d).status !== '완료');
    nodes[it.id] = {
      column, row: columns[column].slots.indexOf(it.id), depth: depth.get(it.id),
      // 잠김: 완료도 진행도 아니고 선행 중 미완이 있다(DEC-7). 진행 항목은 선행이 미완이어도 잠김이 아니다
      locked: !['완료', '진행'].includes(it.status) && blockedByDeps.length > 0,
      blockedByDeps, parents: parents.get(it.id), children: children.get(it.id),
    };
  }

  // 같은 열 안 엣지의 우회 차선: 세로 구간(끝점 포함)이 겹치지 않는 엣지끼리 같은 차선(DEC-41)
  let lanes = 0;
  for (const c of columns) {
    const inner = edges.filter((e) => e.sameColumn && colOf.get(e.from) === c.index)
      .map((e) => { const a = nodes[e.from].row, b = nodes[e.to].row; return { e, lo: Math.min(a, b), hi: Math.max(a, b) }; })
      .sort((x, y) => x.lo - y.lo || x.hi - y.hi || keyCmp(x.e.from, y.e.from) || keyCmp(x.e.to, y.e.to));
    const ends = [];
    for (const x of inner) {
      let k = ends.findIndex((end) => end < x.lo);
      if (k < 0) { k = ends.length; ends.push(0); }
      ends[k] = x.hi;
      x.e.lane = k;
    }
    c.lanes = ends.length;
    lanes = Math.max(lanes, ends.length);
  }

  return { mode, columns, nodes, edges, cyclic, dummies, lanes };
}

// 이웃 열 사이 선분(긴 엣지는 더미를 거치는 조각)을 [왼쪽 열 슬롯, 오른쪽 열 슬롯]으로 낸다
function segments(edges) {
  const segs = [];
  for (const e of edges) {
    if (e.span < 1) continue;
    const pts = [e.from, ...e.via, e.to];
    if (pts.length - 1 !== e.span) continue; // milestone 모드에서 열을 건너뛰는 엣지는 이웃 열 선분이 아니다
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
  }
  return segs;
}

// layer 모드 열 안 순서: 모든 열을 중심값 정렬 왕복 4회로 잡고, exhaustiveMax 이하 열은 이웃 두 열과의 교차 합을
// 순열 전수 탐색으로 최소화한다(DEC-32). 전수 탐색은 현재 배치도 후보라 교차를 늘리지 않는다. 같은 값은 키(order)로 가른다
function orderLayers(columns, edges, keyCmp, exhaustiveMax) {
  const n = columns.length;
  const left = new Map(), right = new Map();
  for (const c of columns) for (const s of c.slots) { left.set(s, []); right.set(s, []); }
  for (const [a, b] of segments(edges)) { right.get(a).push(b); left.get(b).push(a); }
  const pos = new Map();
  const place = (c) => columns[c].slots.forEach((s, i) => pos.set(s, i));
  for (let c = 0; c < n; c++) place(c);

  const bary = (c, nb) => {
    const b = new Map(columns[c].slots.map((s) => {
      const ns = nb.get(s);
      return [s, ns.length ? ns.reduce((t, x) => t + pos.get(x), 0) / ns.length : pos.get(s)];
    }));
    columns[c].slots.sort((x, y) => b.get(x) - b.get(y) || keyCmp(x, y));
    place(c);
  };
  for (let r = 0; r < 4; r++) {
    for (let c = 1; c < n; c++) bary(c, left);
    for (let c = n - 2; c >= 0; c--) bary(c, right);
  }
  if (exhaustiveMax < 2) return;

  // s를 t 위에 둘 때 생기는 교차 수(왼쪽·오른쪽 이웃 열 합)
  const above = (s, t) => {
    let k = 0;
    for (const nb of [left, right]) for (const a of nb.get(s)) for (const b of nb.get(t)) if (pos.get(a) > pos.get(b)) k++;
    return k;
  };
  const refine = (c) => {
    const cur = columns[c].slots;
    if (cur.length < 2 || cur.length > exhaustiveMax) return false;
    const base = [...cur].sort(keyCmp);
    const m = base.length;
    const M = base.map((s) => base.map((t) => (s === t ? 0 : above(s, t))));
    const idx = base.map((_, i) => i);
    let best = null, bestCost = Infinity;
    // 키 사전순으로 순열을 돌아 처음 만난 최소가 같은 교차 중 order가 가장 앞선 배치다
    for (;;) {
      let cost = 0;
      for (let i = 0; i < m && cost < bestCost; i++) for (let j = i + 1; j < m; j++) cost += M[idx[i]][idx[j]];
      if (cost < bestCost) { bestCost = cost; best = [...idx]; }
      let i = m - 2;
      while (i >= 0 && idx[i] > idx[i + 1]) i--;
      if (i < 0) break;
      let j = m - 1;
      while (idx[j] < idx[i]) j--;
      [idx[i], idx[j]] = [idx[j], idx[i]];
      for (let a = i + 1, b = m - 1; a < b; a++, b--) [idx[a], idx[b]] = [idx[b], idx[a]];
    }
    const next = best.map((i) => base[i]);
    const changed = next.some((s, i) => s !== cur[i]);
    columns[c].slots = next;
    place(c);
    return changed;
  };
  for (let r = 0; r < 4; r++) {
    let changed = false;
    for (let c = 0; c < n; c++) changed = refine(c) || changed;
    for (let c = n - 1; c >= 0; c--) changed = refine(c) || changed;
    if (!changed) break;
  }
}

/** 이웃 열 사이 선분의 교차 수. 행은 slots(더미 포함) 순서다. */
export function crossings(tree) {
  const row = (s) => tree.nodes[s]?.row ?? tree.dummies[s].row;
  const col = (s) => tree.nodes[s]?.column ?? tree.dummies[s].column;
  const byCol = new Map();
  for (const [a, b] of segments(tree.edges)) {
    const c = col(a);
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c).push([row(a), row(b)]);
  }
  let k = 0;
  for (const segs of byCol.values()) for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) k++;
  }
  return k;
}

export function pathOf() { throw new Error('pathOf: P1-03에서 만든다'); }
export function geometry() { throw new Error('geometry: P1-03에서 만든다'); }
