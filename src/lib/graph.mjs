// 그래프 모델. 어댑터는 노드·엣지만 넣고, 화면은 파생 뷰만 읽는다.
// 노드: { kind, id, label, props, src: { file, line, rule } }  엣지: { from, to, kind }
export const NODE_KINDS = ['journey', 'step', 'screen', 'api', 'function', 'table', 'migration', 'test', 'commit', 'decision', 'task', 'ledger', 'deploy', 'testreport', 'milestone'];
export const EDGE_KINDS = ['has_step', 'shows', 'uses', 'calls', 'invokes', 'touches', 'covers', 'changes', 'refs', 'defines', 'contains', 'tracks'];

export class Graph {
  constructor() { this.nodes = new Map(); this.edges = []; this.adapters = []; }
  key(kind, id) { return `${kind}:${id}`; }
  add(kind, id, label, props = {}, src = null) {
    if (!NODE_KINDS.includes(kind)) throw new Error(`unknown node kind ${kind}`);
    const k = this.key(kind, id);
    const existing = this.nodes.get(k);
    if (existing) { Object.assign(existing.props, props); if (src && !existing.src) existing.src = src; return existing; }
    const node = { kind, id, label: label ?? id, props, src };
    this.nodes.set(k, node);
    return node;
  }
  link(fromKind, fromId, kind, toKind, toId) {
    if (!EDGE_KINDS.includes(kind)) throw new Error(`unknown edge kind ${kind}`);
    const from = this.key(fromKind, fromId), to = this.key(toKind, toId);
    if (!this.edges.some((e) => e.from === from && e.to === to && e.kind === kind)) this.edges.push({ from, to, kind });
  }
  get(kind, id) { return this.nodes.get(this.key(kind, id)) || null; }
  of(kind) { return [...this.nodes.values()].filter((n) => n.kind === kind); }
  out(kind, id, edgeKind = null) {
    const from = this.key(kind, id);
    return this.edges.filter((e) => e.from === from && (!edgeKind || e.kind === edgeKind)).map((e) => this.nodes.get(e.to)).filter(Boolean);
  }
  in(kind, id, edgeKind = null) {
    const to = this.key(kind, id);
    return this.edges.filter((e) => e.to === to && (!edgeKind || e.kind === edgeKind)).map((e) => this.nodes.get(e.from)).filter(Boolean);
  }
  report(name, status, count, error = null) { this.adapters.push({ name, status, count, error }); }
  toJSON() {
    return { schemaVersion: 1, adapters: this.adapters, nodes: [...this.nodes.values()], edges: this.edges };
  }
}

// 어댑터 실행 래퍼: 실패해도 그래프 생성이 멈추지 않고 failed로 기록된다(빈 표를 "없음"으로 오해하지 않게).
export function runAdapter(graph, name, fn) {
  const before = graph.nodes.size;
  try {
    const partial = fn(graph);
    graph.report(name, partial ? 'partial' : 'ok', graph.nodes.size - before, partial || null);
  } catch (e) {
    graph.report(name, 'failed', graph.nodes.size - before, String(e.message || e));
  }
}
