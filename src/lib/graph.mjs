// 그래프 모델. 어댑터는 노드·엣지만 넣고, 화면은 파생 뷰만 읽는다.
// 노드: { kind, id, label, props, src: { file, line, rule } }  엣지: { from, to, kind } — Graphify·다리 엣지만 props(confidence·typeOnly·deferred·via·bridge)를 더 가진다(2.1.0)
// 문제: { level: 'error'|'warn', label, message, adapter } — 어댑터가 g.issue로 낸 오류·경고. check가 줄로 출력한다.
//   넷째 인자를 주면 code·subject·anchors·resolutions(이슈 계약, src/lib/issues.mjs)를 더 싣는다. 세 인자 호출은 1.1.0 모양 그대로다.
import { issueDetail } from './issues.mjs';

// 2.1.0(minor): 구조 지도가 container·module·symbol·flow 노드와 imports·renders·defined_in·depends·reads·inherits 엣지를 더했다(스펙 DEC-24). contains 는 2.0.2에 이미 있다
export const NODE_KINDS = ['journey', 'step', 'screen', 'api', 'function', 'table', 'migration', 'test', 'commit', 'decision', 'task', 'ledger', 'deploy', 'testreport', 'milestone', 'release', 'container', 'module', 'symbol', 'flow'];
export const EDGE_KINDS = ['has_step', 'shows', 'uses', 'calls', 'invokes', 'touches', 'covers', 'changes', 'refs', 'defines', 'contains', 'tracks', 'imports', 'renders', 'defined_in', 'depends', 'reads', 'inherits'];

export class Graph {
  // architecture: graphify 어댑터와 다리 단계가 남기는 구조 통계(graph.json 에는 싣지 않고 파생이 data.json 에 싣는다). 어댑터가 돌지 않으면 null
  constructor() { this.nodes = new Map(); this.edges = []; this.edgeIndex = new Map(); this.adapters = []; this.issues = []; this.badges = []; this.adapter = null; this.architecture = null; }
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
  // 같은 (from, kind, to)는 한 번만 넣고 그 엣지를 돌려준다. 엣지 키 색인(Map)으로 찾는다: 엣지가 수천이면 배열 전체 훑기가 수천만 번 비교가 된다.
  // props 를 주면(비어 있지 않은 객체) 새 엣지에 props 를 싣는다. 이미 있는 엣지의 props 는 부르는 쪽이 돌려받은 엣지에서 합친다. 2.0.2 호출(다섯 인자)의 엣지 모양은 그대로다
  link(fromKind, fromId, kind, toKind, toId, props = null) {
    if (!EDGE_KINDS.includes(kind)) throw new Error(`unknown edge kind ${kind}`);
    const from = this.key(fromKind, fromId), to = this.key(toKind, toId);
    const k = `${from}\u0000${kind}\u0000${to}`;
    const found = this.edgeIndex.get(k);
    if (found) return found;
    const edge = props && typeof props === 'object' && Object.keys(props).length ? { from, to, kind, props } : { from, to, kind };
    this.edgeIndex.set(k, edge);
    this.edges.push(edge);
    return edge;
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
  // 어댑터가 발견한 문제를 기록한다. level·넷째 인자 형식이 틀리면 throw해 그 어댑터가 failed가 된다. adapter는 runAdapter가 설정한 실행 중 이름.
  issue(level, label, message, detail) {
    if (level !== 'error' && level !== 'warn') throw new Error(`issue level은 'error' 또는 'warn': ${level}`);
    if (typeof label !== 'string' || typeof message !== 'string') throw new Error('issue label·message는 문자열');
    const extra = detail == null ? {} : issueDetail(level, detail);
    this.issues.push({ level, label, message, adapter: this.adapter, ...extra });
  }
  // 개요 요약 줄에 얹는 한 조각. 어댑터가 프로젝트 어휘로 적고 엔진은 글자로만 다룬다(길이 60자, 줄바꿈 금지).
  // 값이 아니라 조각을 받는 이유는 엔진이 프로젝트의 빚·대장 어휘를 모르기 때문이다.
  badge(label, text) {
    if (typeof label !== 'string' || typeof text !== 'string') throw new Error('badge label·text는 문자열');
    const one = text.replace(/\s+/g, ' ').trim();
    if (!one) throw new Error('badge text가 비었다');
    this.badges.push({ label, text: one.slice(0, 60), adapter: this.adapter });
  }
  report(name, status, count, error = null) { this.adapters.push({ name, status, count, error }); }
  toJSON() {
    return { schemaVersion: 1, adapters: this.adapters, nodes: [...this.nodes.values()], edges: this.edges, issues: this.issues, badges: this.badges };
  }
}

// 어댑터 실행 래퍼: 실패해도 그래프 생성이 멈추지 않고 failed로 기록된다(빈 표를 "없음"으로 오해하지 않게).
export function runAdapter(graph, name, fn) {
  const before = graph.nodes.size;
  graph.adapter = name;
  try {
    const partial = fn(graph);
    graph.report(name, partial ? 'partial' : 'ok', graph.nodes.size - before, partial || null);
  } catch (e) {
    graph.report(name, 'failed', graph.nodes.size - before, String(e.message || e));
  } finally {
    graph.adapter = null;
  }
}
